package pace

import (
	"fmt"
	"os"
	"strings"
)

func normalizeLogMode(mode string, debug bool) LogMode {
	switch strings.ToLower(mode) {
	case "pretty":
		return LogPretty
	case "compact":
		return LogCompact
	case "off":
		return LogOff
	default:
		if debug {
			return LogCompact
		}
		return LogOff
	}
}

func shouldIgnoreRoute(route string) bool {
	return route == "/favicon.ico" ||
		route == "/health" ||
		route == "/api/health" ||
		route == "/healthz" ||
		route == "/ping" ||
		route == "/api/ping" ||
		strings.HasPrefix(route, "/_next")
}

func formatDurationMs(ms int64) string {
	if ms <= 0 {
		return "0ms"
	}
	if ms%3_600_000 == 0 {
		return fmt.Sprintf("%dh", ms/3_600_000)
	}
	if ms%60_000 == 0 {
		return fmt.Sprintf("%dm", ms/60_000)
	}
	if ms%1000 == 0 {
		return fmt.Sprintf("%ds", ms/1000)
	}
	return fmt.Sprintf("%dms", ms)
}

func logDecision(mode LogMode, decision CanonicalDecision) {
	if mode == LogOff || shouldIgnoreRoute(decision.Route) {
		return
	}

	headline := "BLOCK"
	switch decision.Decision {
	case DecisionAllow:
		headline = "ALLOW"
	case DecisionWouldBlock:
		headline = "WOULD_BLOCK"
	}

	if mode == LogCompact {
		parts := []string{fmt.Sprintf("[Pace] %s", headline)}
		switch decision.Decision {
		case DecisionAllow:
			parts = append(parts, fmt.Sprintf("route=%s", decision.Route))
			if decision.Remaining >= 0 {
				parts = append(parts, fmt.Sprintf("remaining=%d", decision.Remaining))
			}
			if decision.LatencyMs >= 0 {
				parts = append(parts, fmt.Sprintf("latency=%dms", decision.LatencyMs))
			}
		case DecisionWouldBlock:
			parts = append(parts, decision.Route, fmt.Sprintf("reason=%s", decision.Reason))
			if decision.RefillMs > 0 {
				parts = append(parts, fmt.Sprintf("refill=%s", formatDurationMs(decision.RefillMs)))
			}
		default:
			parts = append(parts, decision.Route, fmt.Sprintf("reason=%s", decision.Reason))
			if decision.ResetMs > 0 {
				parts = append(parts, fmt.Sprintf("reset=%s", formatDurationMs(decision.ResetMs)))
			}
			if decision.RefillMs > 0 {
				parts = append(parts, fmt.Sprintf("refill=%s", formatDurationMs(decision.RefillMs)))
			}
			if decision.LatencyMs >= 0 {
				parts = append(parts, fmt.Sprintf("latency=%dms", decision.LatencyMs))
			}
		}
		_, _ = os.Stdout.WriteString(strings.Join(parts, " ") + "\n")
		return
	}

	lines := []string{fmt.Sprintf("[Pace] %s", headline)}
	if decision.Decision == DecisionAllow {
		lines = append(lines, "", fmt.Sprintf("Route: %s", decision.Route))
		if decision.Remaining >= 0 {
			lines = append(lines, fmt.Sprintf("Remaining: %d", decision.Remaining))
		}
		if decision.LatencyMs >= 0 {
			lines = append(lines, fmt.Sprintf("Latency: %dms", decision.LatencyMs))
		}
	} else if decision.Decision == DecisionWouldBlock {
		lines = append(lines, "", fmt.Sprintf("Route: %s", decision.Route), fmt.Sprintf("Reason: %s", decision.Reason), fmt.Sprintf("Mode: %s", decision.Mode))
		if decision.RefillMs > 0 {
			lines = append(lines, fmt.Sprintf("Refill: %s", formatDurationMs(decision.RefillMs)))
		}
	} else {
		ip := decision.IP
		if ip == "" {
			ip = "unknown"
		}
		lines = append(lines, "", fmt.Sprintf("Route: %s", decision.Route), fmt.Sprintf("IP: %s", ip), fmt.Sprintf("Algorithm: %s", decision.Algorithm), fmt.Sprintf("Reason: %s", decision.Reason), fmt.Sprintf("Mode: %s", decision.Mode))
		if decision.Remaining >= 0 {
			lines = append(lines, fmt.Sprintf("Remaining: %d", decision.Remaining))
		}
		if decision.ResetMs > 0 {
			lines = append(lines, fmt.Sprintf("Reset: %s", formatDurationMs(decision.ResetMs)))
		}
		if decision.RefillMs > 0 {
			lines = append(lines, fmt.Sprintf("Refill: %s", formatDurationMs(decision.RefillMs)))
		}
		if decision.LatencyMs >= 0 {
			lines = append(lines, fmt.Sprintf("Latency: %dms", decision.LatencyMs))
		}
	}

	_, _ = os.Stdout.WriteString(strings.Join(lines, "\n") + "\n")
}