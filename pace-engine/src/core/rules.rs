use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rules {
    pub requests_per_minute: Option<u64>,
    pub requests_per_second: Option<u64>,
    pub burst_limit: Option<u64>,
}

impl Default for Rules {
    fn default() -> Self {
        Self {
            requests_per_minute: Some(100),
            requests_per_second: None,
            burst_limit: Some(20),
        }
    }
}
