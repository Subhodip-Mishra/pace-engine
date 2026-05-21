use dashmap::DashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::canonical::{AlgorithmEvaluation, DecisionReason};

#[derive(Debug, Clone)]
struct Window {
    count: u64,
    window_start: u64,
}

#[derive(Clone)]
pub struct FixedWindow {
    windows: Arc<DashMap<String, Window>>,
    window_ms: u64,
    max_requests: u64,
}

impl FixedWindow {
    pub fn new(window_ms: u64, max_requests: u64) -> Self {
        Self {
            windows: Arc::new(DashMap::new()),
            window_ms,
            max_requests,
        }
    }

    pub fn check(&self, key: &str) -> AlgorithmEvaluation {
        // 1. Lock first and defer
        let mut entry = self
            .windows
            .entry(key.to_string())
            .or_insert_with(|| Window {
                count: 0,
                window_start: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as u64,
            });

        // 2. Fetch time inside the lock
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // 3. Prevent underflow panic
        if now.saturating_sub(entry.window_start) >= self.window_ms {
            entry.count = 0;
            entry.window_start = now;
        }

        let reset_ms = self
            .window_ms
            .saturating_sub(now.saturating_sub(entry.window_start));

        if entry.count < self.max_requests {
            entry.count += 1;
            AlgorithmEvaluation {
                allowed: true,
                reason: DecisionReason::WithinLimit,
                remaining: Some(self.max_requests - entry.count),
                reset_ms: Some(reset_ms),
                refill_ms: None,
                debug_info: format!("{} requests remaining", self.max_requests - entry.count),
            }
        } else {
            AlgorithmEvaluation {
                allowed: false,
                reason: DecisionReason::LimitExceeded,
                remaining: Some(0),
                reset_ms: Some(reset_ms),
                refill_ms: None,
                debug_info: "0 requests remaining".to_string(),
            }
        }
    }
}
