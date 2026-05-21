use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
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
#[serde(rename_all = "snake_case")]
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
#[serde(rename_all = "camelCase")] // CRITICAL: Matches the canonical schema
pub struct CanonicalDecision {
    pub decision: String,
    pub reason: String,
    pub algorithm: String,
    pub route: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remaining: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    pub mode: String,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ip: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub window: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capacity: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refill_rate: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
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
#[serde(rename_all = "camelCase")] // CRITICAL
pub struct CanonicalRequestMetadata {
    pub route: String,
    pub ip: String,
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>, // Changed to Option to match Schema
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_agent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")] // CRITICAL
pub struct CanonicalTelemetryEvent {
    pub event_type: String,
    pub timestamp: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sdk_version: Option<String>,
    pub decision: CanonicalDecision,
    pub request: CanonicalRequestMetadata,
}
