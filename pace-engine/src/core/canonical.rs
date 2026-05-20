use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DecisionReason {
    WithinLimit,
    LimitExceeded,
    TokenExhausted,
}

impl DecisionReason {
    pub fn as_str(&self) -> &'static str {
        match self {
            DecisionReason::WithinLimit => "within_limit",
            DecisionReason::LimitExceeded => "limit_exceeded",
            DecisionReason::TokenExhausted => "token_exhausted",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TrafficDecision {
    Allow,
    Block,
    WouldBlock,
}

impl TrafficDecision {
    pub fn as_str(&self) -> &'static str {
        match self {
            TrafficDecision::Allow => "allow",
            TrafficDecision::Block => "block",
            TrafficDecision::WouldBlock => "would_block",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanonicalDecision {
    pub decision: String,
    pub reason: String,
    pub algorithm: String,
    pub route: String,
    pub key: Option<String>,
    pub remaining: Option<u64>,
    pub reset_ms: Option<u64>,
    pub latency_ms: Option<u64>,
    pub mode: String,
    pub timestamp: i64,
    pub ip: Option<String>,
    pub window: Option<String>,
    pub limit: Option<u64>,
    pub capacity: Option<f64>,
    pub refill_rate: Option<f64>,
    pub refill_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct AlgorithmEvaluation {
    pub allowed: bool,
    pub reason: DecisionReason,
    pub remaining: Option<u64>,
    pub reset_ms: Option<u64>,
    pub refill_ms: Option<u64>,
    pub debug_info: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanonicalRequestMetadata {
    pub route: String,
    pub ip: String,
    pub mode: String,
    pub method: Option<String>,
    pub status_code: u16,
    pub latency_ms: u64,
    pub user_agent: Option<String>,
    pub key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CanonicalTelemetryEvent {
    pub event_type: String,
    pub timestamp: i64,
    pub api_key: String,
    pub sdk_version: Option<String>,
    pub decision: CanonicalDecision,
    pub request: CanonicalRequestMetadata,
}