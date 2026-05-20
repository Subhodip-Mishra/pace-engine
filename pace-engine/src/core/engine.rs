use crate::algorithms::{Algorithm, AlgorithmType, FixedWindow, LeakyBucket, SlidingWindow, TokenBucket};
use crate::core::canonical::{AlgorithmEvaluation, CanonicalDecision, CanonicalRequestMetadata, CanonicalTelemetryEvent, DecisionReason, TrafficDecision};
use crate::core::rules::Rules;
use crate::core::thresholds::Thresholds;
use crate::telemetry::queue::TelemetryQueue;

#[derive(Debug, Clone, PartialEq)]
pub enum ProtectionMode {
    Active,
    Shadow,
    Disabled,
}

impl ProtectionMode {
    pub fn from_str(s: &str) -> Self {
        match s {
            "shadow" => ProtectionMode::Shadow,
            "disabled" => ProtectionMode::Disabled,
            _ => ProtectionMode::Active,
        }
    }
    pub fn as_str(&self) -> &str {
        match self {
            ProtectionMode::Active => "active",
            ProtectionMode::Shadow => "shadow",
            ProtectionMode::Disabled => "disabled",
        }
    }
}

#[derive(Debug, Clone)]
pub struct CheckResult {
    pub allowed: bool,
    pub would_block: bool,
    pub reason: Option<String>,
    pub algorithm: String,
    pub debug_info: String,
    pub decision: CanonicalDecision,
}

pub struct PaceEngine {
    algorithm: Algorithm,
    algorithm_name: String,
    mode: ProtectionMode,
    rules: Rules,
    thresholds: Thresholds,
    telemetry: TelemetryQueue,
    api_key: Option<String>,
    debug: bool,
}

impl PaceEngine {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        algorithm_str: &str,
        mode_str: &str,
        capacity: f64,
        refill_rate: f64,
        api_key: Option<String>,
        debug: bool,
        rules: Rules,
        thresholds: Thresholds,
        backend_url: String,
    ) -> Self {
        let algorithm_type = AlgorithmType::from_str(algorithm_str);
        let enabled = api_key.is_some();

        let algorithm = match algorithm_type {
            AlgorithmType::TokenBucket => Algorithm::TokenBucket(TokenBucket::new(capacity, refill_rate)),
            AlgorithmType::SlidingWindow => Algorithm::SlidingWindow(SlidingWindow::new(60000, capacity as u64)),
            AlgorithmType::FixedWindow => Algorithm::FixedWindow(FixedWindow::new(60000, capacity as u64)),
            AlgorithmType::LeakyBucket => Algorithm::LeakyBucket(LeakyBucket::new(capacity, refill_rate)),
        };

        let telemetry = TelemetryQueue::new(backend_url, enabled);

        Self {
            algorithm,
            algorithm_name: algorithm_str.to_string(),
            mode: ProtectionMode::from_str(mode_str),
            rules,
            thresholds,
            telemetry,
            api_key,
            debug,
        }
    }

    pub fn check_request(&self, ip: &str, route: &str, start_time_ms: u64) -> CheckResult {
        self.check_request_with_identity(None, ip, route, start_time_ms)
    }

    pub fn check_request_with_identity(
        &self,
        identity: Option<&str>,
        ip: &str,
        route: &str,
        start_time_ms: u64,
    ) -> CheckResult {
        if self.mode == ProtectionMode::Disabled {
            let decision = self.build_canonical_decision(
                TrafficDecision::Allow,
                DecisionReason::WithinLimit,
                identity,
                ip,
                route,
                start_time_ms,
                None,
                None,
                None,
            );
            return CheckResult {
                allowed: true,
                would_block: false,
                reason: None,
                algorithm: self.algorithm_name.clone(),
                debug_info: "disabled".to_string(),
                decision,
            };
        }

        let _ = (&self.rules, &self.thresholds);

        let identity_key = identity.unwrap_or(ip);
        let evaluation: AlgorithmEvaluation = self.algorithm.check(identity_key);
        let would_block = !evaluation.allowed;

        let allowed = match self.mode {
            ProtectionMode::Shadow => true,
            ProtectionMode::Active => evaluation.allowed,
            ProtectionMode::Disabled => true,
        };

        let reason = Some(match evaluation.reason {
            DecisionReason::WithinLimit => "within_limit".to_string(),
            DecisionReason::LimitExceeded => "limit_exceeded".to_string(),
            DecisionReason::TokenExhausted => "token_exhausted".to_string(),
        });

        if self.debug {
            println!(
                "[Pace] {} | IP: {} | {} | Mode: {} | {} | {}",
                route,
                ip,
                if would_block { "BLOCK" } else { "ALLOW" },
                self.mode.as_str(),
                self.algorithm_name,
                evaluation.debug_info
            );
        }

        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let latency = now_ms.saturating_sub(start_time_ms);

        let decision_state = if allowed {
            TrafficDecision::Allow
        } else if self.mode == ProtectionMode::Shadow {
            TrafficDecision::WouldBlock
        } else {
            TrafficDecision::Block
        };

        let canonical_decision = self.build_canonical_decision(
            decision_state,
            evaluation.reason.clone(),
            identity,
            ip,
            route,
            start_time_ms,
            evaluation.remaining,
            evaluation.reset_ms,
            evaluation.refill_ms,
        );

        if let Some(api_key) = &self.api_key {
            self.telemetry.push(CanonicalTelemetryEvent {
                event_type: "decision".to_string(),
                timestamp: canonical_decision.timestamp,
                api_key: api_key.clone(),
                sdk_version: None,
                decision: canonical_decision.clone(),
                request: CanonicalRequestMetadata {
                    route: route.to_string(),
                    ip: ip.to_string(),
                    mode: self.mode.as_str().to_string(),
                    method: None,
                    status_code: if !allowed { 429 } else { 200 },
                    latency_ms: latency,
                    user_agent: None,
                    key: identity.map(|v| v.to_string()),
                },
            });
        }

        CheckResult {
            allowed,
            would_block,
            reason,
            algorithm: self.algorithm_name.clone(),
            debug_info: evaluation.debug_info,
            decision: canonical_decision,
        }
    }

    fn build_canonical_decision(
        &self,
        decision: TrafficDecision,
        reason: DecisionReason,
        identity: Option<&str>,
        ip: &str,
        route: &str,
        start_time_ms: u64,
        remaining: Option<u64>,
        reset_ms: Option<u64>,
        refill_ms: Option<u64>,
    ) -> CanonicalDecision {
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        let latency_ms = now_ms.saturating_sub(start_time_ms);

        CanonicalDecision {
            decision: decision.as_str().to_string(),
            reason: reason.as_str().to_string(),
            algorithm: self.algorithm_name.clone(),
            route: route.to_string(),
            key: identity.map(|v| v.to_string()),
            remaining,
            reset_ms,
            latency_ms: Some(latency_ms),
            mode: self.mode.as_str().to_string(),
            timestamp: (now_ms / 1000) as i64,
            ip: Some(ip.to_string()),
            window: None,
            limit: None,
            capacity: None,
            refill_rate: None,
            refill_ms,
        }
    }

    pub fn get_telemetry(&self) -> &TelemetryQueue {
        &self.telemetry
    }
}
