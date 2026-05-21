use pyo3::prelude::*;
use pyo3::types::PyDict;
use std::time::{SystemTime, UNIX_EPOCH};

// Import your existing core engine logic from the pace-engine crate!

use pace_engine::core::engine::PaceEngine;
use pace_engine::core::rules::Rules;
use pace_engine::core::thresholds::Thresholds;

#[pyclass]
pub struct RustEngine {
    inner: PaceEngine,
}

#[pymethods]
impl RustEngine {
    #[new]
    #[pyo3(signature = (algorithm_str, mode_str, capacity, refill_rate, api_key, debug, backend_url))]
    fn new(
        algorithm_str: String,
        mode_str: String,
        capacity: f64,
        refill_rate: f64,
        api_key: Option<String>,
        debug: Option<String>,
        backend_url: String,
    ) -> Self {
        // Initialize with default rules (parity with how you structured it)
        let rules = Rules { requests_per_minute: None, requests_per_second: None, burst_limit: None };
        let thresholds = Thresholds { burst_multiplier: 1.0, block_duration_ms: 60000 };

        let engine = PaceEngine::new(
            &algorithm_str,
            &mode_str,
            capacity,
            refill_rate,
            api_key,
            debug,
            rules,
            thresholds,
            backend_url,
        );

        RustEngine { inner: engine }
    }

    fn check<'py>(
        &self,
        py: Python<'py>,
        ip: String,
        route: String,
        identity: Option<String>,
    ) -> PyResult<&'py PyDict> {
        let start_time_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        // Call your lightning-fast Rust core
        let result = self.inner.check_request_with_identity(
            identity.as_deref(),
            &ip,
            &route,
            start_time_ms,
        );

        // Convert the result into a clean Python dictionary
        let dict = PyDict::new(py);
        dict.set_item("allowed", result.allowed)?;
        dict.set_item("would_block", result.would_block)?;
        if let Some(reason) = result.reason {
            dict.set_item("reason", reason)?;
        }
        
        // Pass the canonical decision back so Python can log it beautifully
        let decision_dict = PyDict::new(py);
        decision_dict.set_item("decision", result.decision.decision)?;
        decision_dict.set_item("reason", result.decision.reason)?;
        decision_dict.set_item("algorithm", result.decision.algorithm)?;
        decision_dict.set_item("route", result.decision.route)?;
        decision_dict.set_item("remaining", result.decision.remaining)?;
        decision_dict.set_item("latency_ms", result.decision.latency_ms)?;
        dict.set_item("decision", decision_dict)?;

        Ok(dict)
    }
}

#[pymodule]
fn pace_native(_py: Python, m: &PyModule) -> PyResult<()> {
    m.add_class::<RustEngine>()?;
    Ok(())
}