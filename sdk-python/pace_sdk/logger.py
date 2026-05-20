from __future__ import annotations

from .types import CanonicalDecision, LogMode, TrafficDecision


def normalize_log_mode(log_mode: str | None, debug: bool) -> LogMode:
    if log_mode == LogMode.PRETTY:
        return LogMode.PRETTY
    if log_mode == LogMode.COMPACT:
        return LogMode.COMPACT
    if log_mode == LogMode.OFF:
        return LogMode.OFF
    return LogMode.COMPACT if debug else LogMode.OFF


def should_ignore_route(route: str) -> bool:
    return route in {
        "/favicon.ico",
        "/health",
        "/api/health",
        "/healthz",
        "/ping",
        "/api/ping",
    } or route.startswith("/_next")


def _format_duration_ms(ms: int) -> str:
    if ms <= 0:
        return "0ms"
    if ms % 3_600_000 == 0:
        return f"{ms // 3_600_000}h"
    if ms % 60_000 == 0:
        return f"{ms // 60_000}m"
    if ms % 1000 == 0:
        return f"{ms // 1000}s"
    return f"{ms}ms"


def log_decision(mode: LogMode, decision: CanonicalDecision) -> None:
    if mode == LogMode.OFF or should_ignore_route(decision.route):
        return

    headline = {
        TrafficDecision.ALLOW: "ALLOW",
        TrafficDecision.BLOCK: "BLOCK",
        TrafficDecision.WOULD_BLOCK: "WOULD_BLOCK",
    }[decision.decision]

    if mode == LogMode.COMPACT:
        parts = [f"[Pace] {headline}"]
        if decision.decision == TrafficDecision.ALLOW:
            parts.append(f"route={decision.route}")
            if decision.remaining is not None:
                parts.append(f"remaining={decision.remaining}")
            if decision.latency_ms is not None:
                parts.append(f"latency={decision.latency_ms}ms")
        elif decision.decision == TrafficDecision.WOULD_BLOCK:
            parts.append(decision.route)
            parts.append(f"reason={decision.reason.value}")
            if decision.refill_ms:
                parts.append(f"refill={_format_duration_ms(decision.refill_ms)}")
        else:
            parts.append(decision.route)
            parts.append(f"reason={decision.reason.value}")
            if decision.reset_ms:
                parts.append(f"reset={_format_duration_ms(decision.reset_ms)}")
            if decision.refill_ms:
                parts.append(f"refill={_format_duration_ms(decision.refill_ms)}")
            if decision.latency_ms is not None:
                parts.append(f"latency={decision.latency_ms}ms")
        print(" ".join(parts))
        return

    lines = [f"[Pace] {headline}"]
    if decision.decision == TrafficDecision.ALLOW:
        lines.extend(["", f"Route: {decision.route}"])
        if decision.remaining is not None:
            lines.append(f"Remaining: {decision.remaining}")
        if decision.latency_ms is not None:
            lines.append(f"Latency: {decision.latency_ms}ms")
    elif decision.decision == TrafficDecision.WOULD_BLOCK:
        lines.extend(["", f"Route: {decision.route}", f"Reason: {decision.reason.value}", f"Mode: {decision.mode.value}"])
        if decision.refill_ms:
            lines.append(f"Refill: {_format_duration_ms(decision.refill_ms)}")
    else:
        lines.extend([
            "",
            f"Route: {decision.route}",
            f"IP: {decision.ip or 'unknown'}",
            f"Algorithm: {decision.algorithm.value}",
            f"Reason: {decision.reason.value}",
            f"Mode: {decision.mode.value}",
        ])
        if decision.remaining is not None:
            lines.append(f"Remaining: {decision.remaining}")
        if decision.reset_ms:
            lines.append(f"Reset: {_format_duration_ms(decision.reset_ms)}")
        if decision.refill_ms:
            lines.append(f"Refill: {_format_duration_ms(decision.refill_ms)}")
        if decision.latency_ms is not None:
            lines.append(f"Latency: {decision.latency_ms}ms")

    print("\n".join(lines))