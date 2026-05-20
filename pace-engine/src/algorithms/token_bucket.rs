use dashmap::DashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::canonical::{AlgorithmEvaluation, DecisionReason};

#[derive(Debug, Clone)]
struct Bucket {
    tokens: f64,
    last_refill: u64,
}

#[derive(Clone)]
pub struct TokenBucket {
    buckets: Arc<DashMap<String, Bucket>>,
    capacity: f64,
    refill_rate: f64, // tokens per second
}

impl TokenBucket {
    pub fn new(capacity: f64, refill_rate: f64) -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
            capacity,
            refill_rate,
        }
    }

    pub fn check(&self, key: &str) -> AlgorithmEvaluation {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut entry = self.buckets.entry(key.to_string()).or_insert(Bucket {
            tokens: self.capacity,
            last_refill: now,
        });

        let elapsed_secs = (now - entry.last_refill) as f64 / 1000.0;
        let new_tokens = (entry.tokens + elapsed_secs * self.refill_rate).min(self.capacity);

        entry.last_refill = now;

        if new_tokens >= 1.0 {
            entry.tokens = new_tokens - 1.0;
            let refill_ms = if self.refill_rate > 0.0 && entry.tokens < self.capacity {
                Some((((1.0 - (entry.tokens % 1.0)) / self.refill_rate) * 1000.0).ceil() as u64)
            } else {
                None
            };

            AlgorithmEvaluation {
                allowed: true,
                reason: DecisionReason::WithinLimit,
                remaining: Some(entry.tokens.floor().max(0.0) as u64),
                reset_ms: None,
                refill_ms,
                debug_info: format!("{:.0} tokens remaining", entry.tokens),
            }
        } else {
            entry.tokens = new_tokens;
            let refill_ms = if self.refill_rate > 0.0 {
                Some((((1.0 - entry.tokens) / self.refill_rate) * 1000.0).ceil() as u64)
            } else {
                None
            };

            AlgorithmEvaluation {
                allowed: false,
                reason: DecisionReason::TokenExhausted,
                remaining: Some(entry.tokens.floor().max(0.0) as u64),
                reset_ms: None,
                refill_ms,
                debug_info: format!("{:.0} tokens remaining", entry.tokens),
            }
        }
    }
}
