use pace_engine::core::canonical::{CanonicalDecision, TrafficDecision};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LogMode {
    Off,
    Compact,
    Pretty,
}

pub fn normalize_log_mode(log_mode: Option<&str>, debug: bool) -> LogMode {
    match log_mode {
        Some("pretty") => LogMode::Pretty,
        Some("compact") => LogMode::Compact,
        Some("off") => LogMode::Off,
        Some(_) => LogMode::Compact,
        None if debug => LogMode::Compact,
        None => LogMode::Off,
    }
}

pub fn should_ignore_route(route: &str) -> bool {
    matches!(
        route,
        "/favicon.ico" | "/health" | "/api/health" | "/healthz" | "/ping" | "/api/ping"
    ) || route.starts_with("/_next")
}

fn format_duration_ms(ms: u64) -> String {
    if ms == 0 {
        return "0ms".to_string();
    }
    if ms % 3_600_000 == 0 {
        return format!("{}h", ms / 3_600_000);
    }
    if ms % 60_000 == 0 {
        return format!("{}m", ms / 60_000);
    }
    if ms % 1000 == 0 {
        return format!("{}s", ms / 1000);
    }
    format!("{}ms", ms)
}

pub fn log_decision(mode: LogMode, decision: &CanonicalDecision) {
    if mode == LogMode::Off || should_ignore_route(&decision.route) {
        return;
    }

    let headline = match decision.decision.as_str() {
        "allow" => "ALLOW",
        "would_block" => "WOULD_BLOCK",
        _ => "BLOCK",
    };

    if mode == LogMode::Compact {
        let mut parts = vec![format!("[Pace] {}", headline)];
        if decision.decision == TrafficDecision::Allow.as_str() {
            parts.push(format!("route={}", decision.route));
            if let Some(remaining) = decision.remaining {
                parts.push(format!("remaining={}", remaining));
            }
            if let Some(latency_ms) = decision.latency_ms {
                parts.push(format!("latency={}ms", latency_ms));
            }
        } else if decision.decision == TrafficDecision::WouldBlock.as_str() {
            parts.push(decision.route.clone());
            parts.push(format!("reason={}", decision.reason));
            if let Some(refill_ms) = decision.refill_ms {
                parts.push(format!("refill={}", format_duration_ms(refill_ms)));
            }
        } else {
            parts.push(decision.route.clone());
            parts.push(format!("reason={}", decision.reason));
            if let Some(reset_ms) = decision.reset_ms {
                parts.push(format!("reset={}", format_duration_ms(reset_ms)));
            }
            if let Some(refill_ms) = decision.refill_ms {
                parts.push(format!("refill={}", format_duration_ms(refill_ms)));
            }
            if let Some(latency_ms) = decision.latency_ms {
                parts.push(format!("latency={}ms", latency_ms));
            }
        }
        println!("{}", parts.join(" "));
        return;
    }

    let mut lines = vec![format!("[Pace] {}", headline)];
    if decision.decision == TrafficDecision::Allow.as_str() {
        lines.push(String::new());
        lines.push(format!("Route: {}", decision.route));
        if let Some(remaining) = decision.remaining {
            lines.push(format!("Remaining: {}", remaining));
        }
        if let Some(latency_ms) = decision.latency_ms {
            lines.push(format!("Latency: {}ms", latency_ms));
        }
    } else if decision.decision == TrafficDecision::WouldBlock.as_str() {
        lines.push(String::new());
        lines.push(format!("Route: {}", decision.route));
        lines.push(format!("Reason: {}", decision.reason));
        lines.push(format!("Mode: {}", decision.mode));
        if let Some(refill_ms) = decision.refill_ms {
            lines.push(format!("Refill: {}", format_duration_ms(refill_ms)));
        }
    } else {
        lines.push(String::new());
        lines.push(format!("Route: {}", decision.route));
        lines.push(format!("IP: {}", decision.ip.as_deref().unwrap_or("unknown")));
        lines.push(format!("Algorithm: {}", decision.algorithm));
        lines.push(format!("Reason: {}", decision.reason));
        lines.push(format!("Mode: {}", decision.mode));
        if let Some(remaining) = decision.remaining {
            lines.push(format!("Remaining: {}", remaining));
        }
        if let Some(reset_ms) = decision.reset_ms {
            lines.push(format!("Reset: {}", format_duration_ms(reset_ms)));
        }
        if let Some(refill_ms) = decision.refill_ms {
            lines.push(format!("Refill: {}", format_duration_ms(refill_ms)));
        }
        if let Some(latency_ms) = decision.latency_ms {
            lines.push(format!("Latency: {}ms", latency_ms));
        }
    }

    println!("{}", lines.join("\n"));
}