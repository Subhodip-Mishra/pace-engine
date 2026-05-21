use crate::core::engine::PaceEngine;
use crate::core::rules::Rules;
use crate::core::thresholds::Thresholds;
use napi_derive::napi;
use std::sync::Arc;

#[napi(object)]
pub struct NodeConfig {
    pub algorithm: Option<String>,
    pub mode: Option<String>,
    pub capacity: Option<f64>,
    pub refill_rate: Option<f64>,
    pub api_key: Option<String>,
    // FIXED: Changed from Option<bool> to Option<String> to accept "compact" | "pretty"
    pub debug: Option<String>, 
    pub backend_url: Option<String>,
    pub requests_per_minute: Option<f64>,
    pub requests_per_second: Option<f64>,
    pub burst_limit: Option<f64>,
    pub burst_multiplier: Option<f64>,
    pub block_duration_ms: Option<f64>,
}

#[napi(object)]
pub struct CheckResultNode {
    pub allowed: bool,
    pub would_block: bool,
    pub reason: Option<String>,
    pub algorithm: String,
    pub debug_info: String,
}

#[napi]
pub struct PaceNode {
    engine: Arc<PaceEngine>,
}

#[napi]
impl PaceNode {
    #[napi(constructor)]
    pub fn new(config: NodeConfig) -> Self {
        let algorithm = config.algorithm.unwrap_or_else(|| "token_bucket".to_string());
        let mode = config.mode.unwrap_or_else(|| "active".to_string());
        let capacity = config.capacity.unwrap_or(100.0);
        let refill_rate = config.refill_rate.unwrap_or(10.0);
        let backend_url = config
            .backend_url
            .unwrap_or_else(|| "http://localhost:4000".to_string());

        let rules = Rules {
            requests_per_minute: config.requests_per_minute.map(|v| v as u64),
            requests_per_second: config.requests_per_second.map(|v| v as u64),
            burst_limit: config.burst_limit.map(|v| v as u64),
        };

        let thresholds = Thresholds {
            burst_multiplier: config.burst_multiplier.unwrap_or(2.0),
            block_duration_ms: config.block_duration_ms.map(|v| v as u64).unwrap_or(60000),
        };

        let engine = PaceEngine::new(
            &algorithm,
            &mode,
            capacity,
            refill_rate,
            config.api_key,
            config.debug, // FIXED: Pass the Option<String> directly
            rules,
            thresholds,
            backend_url,
        );

        Self {
            engine: Arc::new(engine),
        }
    }

    #[napi]
    pub fn check_request(&self, ip: String, route: String, start_time_ms: f64) -> CheckResultNode {
        let result = self
            .engine
            .check_request(&ip, &route, start_time_ms as u64);

        CheckResultNode {
            allowed: result.allowed,
            would_block: result.would_block,
            reason: result.reason,
            algorithm: result.algorithm,
            debug_info: result.debug_info,
        }
    }
}