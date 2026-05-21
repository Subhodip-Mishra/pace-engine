use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::canonical::{AlgorithmEvaluation, DecisionReason};

#[derive(Clone)]
pub struct SlidingWindow {
    windows: Arc<DashMap<String, VecDeque<u64>>>,
    window_ms: u64,
    max_requests: u64,
}

impl SlidingWindow {
    pub fn new(window_ms: u64, max_requests: u64) -> Self {
        Self {
            windows: Arc::new(DashMap::new()),
            window_ms,
            max_requests,
        }
    }

    pub fn check(&self, key: &str) -> AlgorithmEvaluation {
        // 1. Lock first
        let mut entry = self
            .windows
            .entry(key.to_string())
            .or_insert_with(VecDeque::new);

        // 2. Fetch time inside the lock
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // 3. Saturating sub for window boundary
        let window_start = now.saturating_sub(self.window_ms);

        while let Some(&front) = entry.front() {
            if front < window_start {
                entry.pop_front();
            } else {
                break;
            }
        }
        let current_count = entry.len() as u64;
        let reset_ms = entry
            .front()
            .map(|front| front.saturating_add(self.window_ms).saturating_sub(now));

        if current_count < self.max_requests {
            entry.push_back(now);
            AlgorithmEvaluation {
                allowed: true,
                reason: DecisionReason::WithinLimit,
                remaining: Some(self.max_requests - current_count - 1),
                reset_ms,
                refill_ms: None,
                debug_info: format!(
                    "{} requests remaining",
                    self.max_requests - current_count - 1
                ),
            }
        } else {
            AlgorithmEvaluation {
                allowed: false,
                reason: DecisionReason::LimitExceeded,
                remaining: Some(0),
                reset_ms,
                refill_ms: None,
                debug_info: "0 requests remaining".to_string(),
            }
        }
    }
}
