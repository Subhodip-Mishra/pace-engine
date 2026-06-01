from __future__ import annotations
import os
from typing import Optional, Union, List, Callable
from .pace_native import RustEngine
from .logger import log_decision
from .types import (
    CheckResult, PaceConfig, CanonicalDecision, TrafficDecision, DecisionReason, Algorithm,
    CheckConfig, TokenBucketConfig, FixedWindowConfig, SlidingWindowConfig, LeakyBucketConfig,
    ProtectionMode
)

def _algorithm_value(config_algorithm):
    return getattr(config_algorithm, "value", config_algorithm)

class PaceLimit:
    def __init__(self, pace: Pace, config: CheckConfig):
        self.pace = pace
        self.config = config

    def __call__(self, request):
        ip = request.client.host if request.client else "127.0.0.1"
        route = request.url.path
        result = self.pace.check(ip=ip, route=route, config=self.config)
        if not result.allowed:
            from fastapi import HTTPException
            raise HTTPException(status_code=429, detail="Rate limit exceeded")

    def __decorator__(self, f):
        from functools import wraps
        @wraps(f)
        def wrapper(*args, **kwargs):
            from flask import jsonify, request
            ip = request.headers.get("X-Forwarded-For", request.remote_addr) or request.remote_addr or "127.0.0.1"
            route = request.path
            result = self.pace.check(ip=ip, route=route, config=self.config)
            if not result.allowed:
                return jsonify({"message": "Rate limit exceeded"}), 429
            return f(*args, **kwargs)
        return wrapper

class Pace:
    def __init__(self, config: PaceConfig):
        self.config = config
        self.log_mode = config.debug        
        if os.environ.get("PACE_DEBUG") == "true":
            print("[Pace] ⚡ Rust engine loaded")

        debug_str = config.debug if isinstance(config.debug, str) else ("compact" if config.debug else None)
        
        algo = _algorithm_value(config.algorithm)
        capacity = float(config.capacity)
        if algo in (Algorithm.SLIDING_WINDOW, Algorithm.SLIDING_WINDOW.value,
                    Algorithm.FIXED_WINDOW, Algorithm.FIXED_WINDOW.value):
            if config.thresholds and config.thresholds.burst is not None:
                capacity = float(config.thresholds.burst)

        self._native_engine = RustEngine(
            algo,
            config.mode.value,
            capacity,
            float(config.refill_rate),
            config.api_key,
            debug_str,
            config.backend_url
        )

    def limit(self, config: CheckConfig) -> PaceLimit:
        return PaceLimit(self, config)

    def check(
        self,
        ip: str,
        route: str = "/",
        config: Optional[CheckConfig] = None,
        key: Optional[str] = None,
    ) -> CheckResult:
        if config is not None:
            algo = _algorithm_value(config.algorithm)
            if isinstance(config, (TokenBucketConfig, LeakyBucketConfig)):
                capacity = float(config.capacity)
                refill_rate = float(config.refill_rate)
            else:  # SlidingWindowConfig or FixedWindowConfig
                capacity = float(config.limit)
                refill_rate = 10.0  # default/dummy refill rate
            
            debug_str = self.config.debug if isinstance(self.config.debug, str) else ("compact" if self.log_mode else None)
            engine = RustEngine(
                algo,
                self.config.mode.value,
                capacity,
                refill_rate,
                self.config.api_key,
                debug_str,
                self.config.backend_url
            )
        else:
            engine = self._native_engine

        composite_key = f"{key or ip}::{route}"
        res = engine.check(ip, route, composite_key)
        
        allowed = res.get("allowed", True)
        would_block = res.get("would_block", False)
        
        dec_data = res.get("decision", {})
        decision_val = dec_data.get("decision", "allow")
        
        if self.config.mode == ProtectionMode.SHADOW and would_block:
            decision_val = "would_block"
        elif not allowed:
            decision_val = "block"
            
        decision = CanonicalDecision(
            decision=TrafficDecision(decision_val),
            reason=DecisionReason(dec_data.get("reason", "within_limit")),
            algorithm=Algorithm(dec_data.get("algorithm", "token_bucket")),
            route=dec_data.get("route", route),
            ip=ip,
            key=key or ip,
            remaining=dec_data.get("remaining"),
            latency_ms=dec_data.get("latency_ms", 0),
            mode=self.config.mode
        )
        
        result = CheckResult(
            allowed=allowed,
            would_block=would_block,
            reason=res.get("reason"),
            decision=decision
        )

        log_decision(self.log_mode, decision)
        return result

    def check_detailed(self, ip: str, route: str = "/", key: Optional[str] = None) -> CheckResult:
        return self.check(ip, route, key=key)

    def check_with_key(self, key: str, ip: str, route: str = "/") -> CheckResult:
        return self.check(ip, route, key=key)