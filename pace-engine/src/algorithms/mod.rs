use crate::core::canonical::AlgorithmEvaluation;

pub mod fixed_window;
pub mod leaky_bucket;
pub mod sliding_window;
pub mod token_bucket;

pub use fixed_window::FixedWindow;
pub use leaky_bucket::LeakyBucket;
pub use sliding_window::SlidingWindow;
pub use token_bucket::TokenBucket;

#[derive(Debug, Clone)]
pub enum AlgorithmType {
    TokenBucket,
    SlidingWindow,
    FixedWindow,
    LeakyBucket,
}

impl AlgorithmType {
    pub fn from_str(s: &str) -> Self {
        match s {
            "sliding_window" => AlgorithmType::SlidingWindow,
            "fixed_window" => AlgorithmType::FixedWindow,
            "leaky_bucket" => AlgorithmType::LeakyBucket,
            _ => AlgorithmType::TokenBucket,
        }
    }
}

pub enum Algorithm {
    TokenBucket(TokenBucket),
    SlidingWindow(SlidingWindow),
    FixedWindow(FixedWindow),
    LeakyBucket(LeakyBucket),
}

impl Algorithm {
    pub fn check(&self, key: &str) -> AlgorithmEvaluation {
        match self {
            Algorithm::TokenBucket(a) => {
                a.check(key)
            }
            Algorithm::SlidingWindow(a) => {
                a.check(key)
            }
            Algorithm::FixedWindow(a) => {
                a.check(key)
            }
            Algorithm::LeakyBucket(a) => {
                a.check(key)
            }
        }
    }
}
