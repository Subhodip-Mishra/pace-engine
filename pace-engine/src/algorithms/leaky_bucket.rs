use dashmap::DashMap;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::core::canonical::{AlgorithmEvaluation, DecisionReason};

#[derive(Debug, Clone)]
struct Bucket {
    water_level: f64,
    last_leak: u64,
}

#[derive(Clone)]
pub struct LeakyBucket {
    buckets: Arc<DashMap<String, Bucket>>,
    capacity: f64,
    leak_rate: f64, // requests per second
}

impl LeakyBucket {
    pub fn new(capacity: f64, leak_rate: f64) -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
            capacity,
            leak_rate,
        }
    }

    pub fn check(&self, key: &str) -> AlgorithmEvaluation {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let mut entry = self.buckets.entry(key.to_string()).or_insert(Bucket {
            water_level: 0.0,
            last_leak: now,
        });

        let elapsed_secs = (now - entry.last_leak) as f64 / 1000.0;
        let leaked = elapsed_secs * self.leak_rate;
        entry.water_level = (entry.water_level - leaked).max(0.0);
        entry.last_leak = now;

        if entry.water_level < self.capacity {
            entry.water_level += 1.0;
            AlgorithmEvaluation {
                allowed: true,
                reason: DecisionReason::WithinLimit,
                remaining: Some((self.capacity - entry.water_level).floor().max(0.0) as u64),
                reset_ms: None,
                refill_ms: None,
                debug_info: format!("{:.0} bucket space remaining", self.capacity - entry.water_level),
            }
        } else {
            AlgorithmEvaluation {
                allowed: false,
                reason: DecisionReason::LimitExceeded,
                remaining: Some(0),
                reset_ms: None,
                refill_ms: None,
                debug_info: "0 bucket space remaining".to_string(),
            }
        }
    }
}
