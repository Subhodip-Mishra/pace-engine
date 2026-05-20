mod logger;
mod middleware;

pub use pace_engine::core::engine::{CheckResult, PaceEngine, ProtectionMode};
pub use pace_engine::core::rules::Rules;
pub use pace_engine::core::thresholds::Thresholds;
pub use logger::{log_decision, normalize_log_mode, should_ignore_route, LogMode};

use pace_engine::core::canonical::CanonicalDecision;

pub struct PaceConfig {
    pub algorithm: String,
    pub mode: String,
    pub capacity: f64,
    pub refill_rate: f64,
    pub api_key: Option<String>,
    pub debug: bool,
    pub log_mode: Option<String>,
    pub identity_header: Option<String>,
    pub backend_url: String,
    pub rules: Rules,
    pub thresholds: Thresholds,
}

impl Default for PaceConfig {
    fn default() -> Self {
        Self {
            algorithm: "token_bucket".to_string(),
            mode: "active".to_string(),
            capacity: 100.0,
            refill_rate: 10.0,
            api_key: None,
            debug: false,
            log_mode: None,
            identity_header: None,
            backend_url: "http://localhost:4000".to_string(),
            rules: Rules::default(),
            thresholds: Thresholds::default(),
        }
    }
}

pub struct Pace {
    engine: PaceEngine,
    log_mode: LogMode,
    identity_header: Option<String>,
}

impl Pace {
    pub fn new(config: PaceConfig) -> Self {
        let log_mode = normalize_log_mode(config.log_mode.as_deref(), config.debug);
        let engine = PaceEngine::new(
            &config.algorithm,
            &config.mode,
            config.capacity,
            config.refill_rate,
            config.api_key,
            config.debug,
            config.rules,
            config.thresholds,
            config.backend_url,
        );
        Self {
            engine,
            log_mode,
            identity_header: config.identity_header,
        }
    }

    pub fn check(&self, ip: &str, route: &str) -> bool {
        self.check_detailed(ip, route).allowed
    }

    pub fn check_detailed(&self, ip: &str, route: &str) -> CheckResult {
        let start = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        self.engine.check_request(ip, route, start)
    }

    pub fn check_with_identity(&self, identity: Option<&str>, ip: &str, route: &str) -> bool {
        self.check_detailed_with_identity(identity, ip, route).allowed
    }

    pub fn check_detailed_with_identity(
        &self,
        identity: Option<&str>,
        ip: &str,
        route: &str,
    ) -> CheckResult {
        let start = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;
        self.engine.check_request_with_identity(identity, ip, route, start)
    }

    pub fn log_mode(&self) -> LogMode {
        self.log_mode
    }

    pub fn identity_header(&self) -> Option<&str> {
        self.identity_header.as_deref()
    }

    pub fn decision(&self, ip: &str, route: &str) -> CanonicalDecision {
        self.check_detailed(ip, route).decision
    }
}

#[cfg(feature = "axum")]
pub use middleware::axum_adapter::middleware as axum_middleware;

#[cfg(feature = "actix")]
pub use middleware::actix_adapter::PaceActixMiddleware;
