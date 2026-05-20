from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from .logger import log_decision, normalize_log_mode
from .telemetry import TelemetryQueue
from .types import (
    Algorithm,
    CanonicalDecision,
    CanonicalTelemetryEvent,
    CanonicalTelemetryRequest,
    CheckResult,
    DecisionReason,
    LogMode,
    PaceConfig,
    ProtectionMode,
    TrafficDecision,
)


@dataclass
class _TokenBucketState:
    tokens: float
    last_refill: float
    last_seen: float


@dataclass
class _FixedWindowState:
    window_start: float
    count: int
    last_seen: float


@dataclass
class _SlidingWindowState:
    timestamps: List[float]
    last_seen: float


@dataclass
class _AlgorithmEval:
    allowed: bool
    reason: DecisionReason
    remaining: int
    reset_ms: int = 0
    refill_ms: int = 0


class Pace:
    def __init__(self, config: PaceConfig):
        self.config = config
        self.log_mode: LogMode = normalize_log_mode(config.log_mode, config.debug)
        self.token_buckets: Dict[str, _TokenBucketState] = {}
        self.fixed_windows: Dict[str, _FixedWindowState] = {}
        self.sliding_windows: Dict[str, _SlidingWindowState] = {}
        self.lock = threading.Lock()
        self.telemetry = TelemetryQueue(
            api_key=config.api_key or "",
            backend_url=config.backend_url,
            enabled=config.api_key is not None,
        )

    def check(self, ip: str, route: str = "/", key: Optional[str] = None) -> CheckResult:
        return self.check_detailed(ip, route, key)

    def check_detailed(self, ip: str, route: str = "/", key: Optional[str] = None) -> CheckResult:
        start = time.time()
        if self.config.mode == ProtectionMode.DISABLED:
            decision = self._build_decision(
                TrafficDecision.ALLOW,
                DecisionReason.WITHIN_LIMIT,
                ip=ip,
                route=route,
                key=key,
                start=start,
                evaluation=_AlgorithmEval(True, DecisionReason.WITHIN_LIMIT, self.config.capacity),
            )
            return CheckResult(allowed=True, would_block=False, reason=DecisionReason.WITHIN_LIMIT.value, decision=decision)

        evaluation = self._evaluate(ip, route, key)
        allowed = evaluation.allowed or self.config.mode == ProtectionMode.SHADOW
        would_block = not evaluation.allowed
        decision_type = TrafficDecision.ALLOW
        if not allowed:
            decision_type = TrafficDecision.BLOCK
        elif would_block and self.config.mode == ProtectionMode.SHADOW:
            decision_type = TrafficDecision.WOULD_BLOCK

        decision = self._build_decision(
            decision_type,
            evaluation.reason,
            ip=ip,
            route=route,
            key=key,
            start=start,
            evaluation=evaluation,
        )

        result = CheckResult(
            allowed=allowed,
            would_block=would_block,
            reason=evaluation.reason.value,
            decision=decision,
        )

        log_decision(self.log_mode, decision)
        self.telemetry.push(
            CanonicalTelemetryEvent(
                event_type="decision",
                timestamp=decision.timestamp,
                api_key=self.config.api_key,
                sdk_version="0.1.0",
                decision=decision,
                request=CanonicalTelemetryRequest(
                    route=route,
                    ip=ip,
                    status_code=429 if not allowed else 200,
                    latency_ms=decision.latency_ms,
                    key=key,
                    mode=self.config.mode,
                ),
            )
        )
        return result

    def check_with_key(self, key: str, ip: str, route: str = "/") -> CheckResult:
        return self.check_detailed(ip, route, key)

    def _evaluate(self, ip: str, route: str, key: Optional[str]) -> _AlgorithmEval:
        identity = key or ip
        state_key = f"{identity}::{route}"
        now = time.time()

        with self.lock:
            if self.config.algorithm == Algorithm.SLIDING_WINDOW:
                return self._evaluate_sliding_window(state_key, now)
            if self.config.algorithm == Algorithm.FIXED_WINDOW:
                return self._evaluate_fixed_window(state_key, now)
            return self._evaluate_token_bucket(state_key, now)

    def _evaluate_token_bucket(self, state_key: str, now: float) -> _AlgorithmEval:
        state = self.token_buckets.get(
            state_key,
            _TokenBucketState(tokens=float(self.config.capacity), last_refill=now, last_seen=now),
        )
        elapsed = now - state.last_refill
        if elapsed > 0 and self.config.refill_rate > 0:
            state.tokens = min(float(self.config.capacity), state.tokens + elapsed * self.config.refill_rate)
        state.last_refill = now

        allowed = state.tokens >= 1
        remaining = int(state.tokens)
        refill_ms = 0
        if allowed:
            state.tokens -= 1
            remaining = int(state.tokens)
            if self.config.refill_rate > 0 and state.tokens < float(self.config.capacity):
                refill_ms = int(((1 - (state.tokens % 1)) / self.config.refill_rate) * 1000)
            self.token_buckets[state_key] = state
            return _AlgorithmEval(True, DecisionReason.WITHIN_LIMIT, max(0, remaining), 0, refill_ms)

        if self.config.refill_rate > 0:
            deficit = 1 - state.tokens
            refill_ms = int((deficit / self.config.refill_rate) * 1000)
        self.token_buckets[state_key] = state
        return _AlgorithmEval(False, DecisionReason.TOKEN_EXHAUSTED, max(0, remaining), 0, refill_ms)

    def _evaluate_fixed_window(self, state_key: str, now: float) -> _AlgorithmEval:
        window_ms = self.config.thresholds.block_duration_ms
        limit = self.config.thresholds.burst
        state = self.fixed_windows.get(state_key)
        if state is None:
            state = _FixedWindowState(window_start=now, count=0, last_seen=now)
        if (now - state.window_start) * 1000 >= window_ms:
            state = _FixedWindowState(window_start=now, count=0, last_seen=now)

        reset_ms = max(0, int(window_ms - (now - state.window_start) * 1000))
        if state.count < limit:
            state.count += 1
            remaining = limit - state.count
            state.last_seen = now
            self.fixed_windows[state_key] = state
            return _AlgorithmEval(True, DecisionReason.WITHIN_LIMIT, remaining, reset_ms, 0)

        state.last_seen = now
        self.fixed_windows[state_key] = state
        return _AlgorithmEval(False, DecisionReason.LIMIT_EXCEEDED, 0, reset_ms, 0)

    def _evaluate_sliding_window(self, state_key: str, now: float) -> _AlgorithmEval:
        window_ms = self.config.thresholds.block_duration_ms
        limit = self.config.thresholds.burst
        state = self.sliding_windows.get(state_key)
        if state is None:
            state = _SlidingWindowState(timestamps=[], last_seen=now)

        cutoff = now - window_ms / 1000.0
        state.timestamps = [timestamp for timestamp in state.timestamps if timestamp > cutoff]

        reset_ms = 0
        if state.timestamps:
            reset_ms = max(0, int((state.timestamps[0] + window_ms / 1000.0 - now) * 1000))

        if len(state.timestamps) < limit:
            state.timestamps.append(now)
            remaining = limit - len(state.timestamps)
            state.last_seen = now
            self.sliding_windows[state_key] = state
            return _AlgorithmEval(True, DecisionReason.WITHIN_LIMIT, remaining, reset_ms, 0)

        state.last_seen = now
        self.sliding_windows[state_key] = state
        return _AlgorithmEval(False, DecisionReason.LIMIT_EXCEEDED, 0, reset_ms, 0)

    def _build_decision(
        self,
        decision: TrafficDecision,
        reason: DecisionReason,
        ip: str,
        route: str,
        key: Optional[str],
        start: float,
        evaluation: _AlgorithmEval,
    ) -> CanonicalDecision:
        latency_ms = int((time.time() - start) * 1000)
        return CanonicalDecision(
            decision=decision,
            reason=reason,
            algorithm=self.config.algorithm,
            route=route,
            key=key or ip,
            remaining=evaluation.remaining,
            reset_ms=evaluation.reset_ms,
            latency_ms=latency_ms,
            mode=self.config.mode,
            timestamp=int(time.time()),
            ip=ip,
            limit=self.config.thresholds.burst if self.config.algorithm != Algorithm.TOKEN_BUCKET else None,
            capacity=self.config.capacity if self.config.algorithm == Algorithm.TOKEN_BUCKET else None,
            refill_rate=float(self.config.refill_rate) if self.config.algorithm == Algorithm.TOKEN_BUCKET else None,
            refill_ms=evaluation.refill_ms,
        )
