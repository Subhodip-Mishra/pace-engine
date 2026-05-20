use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thresholds {
    pub burst_multiplier: f64,
    pub block_duration_ms: u64,
}

impl Default for Thresholds {
    fn default() -> Self {
        Self {
            burst_multiplier: 2.0,
            block_duration_ms: 60000,
        }
    }
}
