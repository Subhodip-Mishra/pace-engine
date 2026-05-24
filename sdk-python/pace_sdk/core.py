# sdk-python/pace_sdk/core.py
from __future__ import annotations
import os
import threading
from typing import Optional
from .pace_native import RustEngine
from .logger import log_decision
from .types import CheckResult, PaceConfig, CanonicalDecision, TrafficDecision, DecisionReason, Algorithm

class Pace:
    def __init__(self, config: PaceConfig):
        self.config = config
        self._lock = threading.Lock()
        self.log_mode = config.debug        
        if os.environ.get("PACE_DEBUG") == "true":
            print("[Pace] ⚡ Rust engine loaded")

        debug_str = config.debug if isinstance(config.debug, str) else ("compact" if config.debug else None)
        
        self._native_engine = RustEngine(
            config.algorithm.value,
            config.mode.value,
            float(config.capacity),
            float(config.refill_rate),
            config.api_key,
            debug_str,
            config.backend_url
        )

    def check(self, ip: str, route: str = "/", key: Optional[str] = None) -> CheckResult:
        with self._lock:
            # Pass everything to Rust. No Python math, no locks, no state dicts!
            res = self._native_engine.check(ip, route, key)
        
        dec_data = res.get("decision", {})
        decision = CanonicalDecision(
            decision=TrafficDecision(dec_data.get("decision", "allow")),
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
            allowed=res.get("allowed", True),
            would_block=res.get("would_block", False),
            reason=res.get("reason"),
            decision=decision
        )

        log_decision(self.log_mode, decision)
        return result

    def check_detailed(self, ip: str, route: str = "/", key: Optional[str] = None) -> CheckResult:
        return self.check(ip, route, key)

    def check_with_key(self, key: str, ip: str, route: str = "/") -> CheckResult:
        return self.check(ip, route, key)