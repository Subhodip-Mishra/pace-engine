from typing import Union
from .types import CanonicalDecision, TrafficDecision

# Global Color Definitions
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RESET = "\033[0m"

def should_ignore_route(route: str) -> bool:
    return route in {"/favicon.ico", "/health", "/api/health", "/healthz", "/ping", "/api/ping"} or route.startswith("/_next")

def _format_duration_ms(ms: int) -> str:
    if ms <= 0: return "0ms"
    if ms % 3_600_000 == 0: return f"{ms // 3_600_000}h"
    if ms % 60_000 == 0: return f"{ms // 60_000}m"
    if ms % 1000 == 0: return f"{ms // 1000}s"
    return f"{ms}ms"

def log_decision(debug_mode: Union[bool, str], decision: CanonicalDecision) -> None:
    if not debug_mode or should_ignore_route(decision.route):
        return

    # 1. COMPACT MODE
    if debug_mode == "compact" or debug_mode is True:
        if decision.decision == TrafficDecision.ALLOW:
            headline = f"{GREEN}ALLOW{RESET}"
        else:
            headline = f"{RED}BLOCK{RESET}"
            
        parts = [f"[Pace] {headline}", f"route={decision.route}"]
        if decision.remaining is not None: parts.append(f"remaining={decision.remaining}")
        if decision.latency_ms is not None: parts.append(f"latency={decision.latency_ms}ms")
        print(" ".join(parts))
        return

    # 2. PRETTY MODE
    if debug_mode == "pretty":
        if decision.decision == TrafficDecision.ALLOW:
            print(f"{GREEN}[Pace] 🟢 ALLOWED{RESET}")
            print(f"│ Route:     {decision.route}")
            if decision.remaining is not None:
                print(f"│ Remaining: {decision.remaining}")
            if decision.latency_ms is not None:
                print(f"│ Latency:   {decision.latency_ms}ms")
            print(f"└────────────────────────────────────────")
        else:
            headline = "🔴 BLOCKED" if decision.decision == TrafficDecision.BLOCK else "🟡 WOULD BLOCK"
            color = RED if decision.decision == TrafficDecision.BLOCK else YELLOW
            
            print(f"{color}[Pace] {headline}{RESET}")
            print(f"│ Route:     {decision.route}")
            print(f"│ IP:        {decision.ip or 'unknown'}")
            print(f"│ Algorithm: {decision.algorithm.value}")
            print(f"│ Reason:    {decision.reason.value}")
            if decision.mode:
                print(f"│ Mode:      {decision.mode.value}")
            if decision.remaining is not None:
                print(f"│ Remaining: {decision.remaining}")
            if decision.refill_ms:
                print(f"│ Refill:    {_format_duration_ms(decision.refill_ms)}")
            if decision.latency_ms is not None:
                print(f"│ Latency:   {decision.latency_ms}ms")
            print(f"└────────────────────────────────────────")