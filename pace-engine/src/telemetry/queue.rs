use super::events::CanonicalTelemetryEvent;
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time;

const BATCH_SIZE: usize = 500;
const FLUSH_INTERVAL_MS: u64 = 2000;
const MAX_QUEUE_SIZE: usize = 10000;

#[derive(Clone)]
pub struct TelemetryQueue {
    queue: Arc<Mutex<Vec<CanonicalTelemetryEvent>>>,
    backend_url: String,
    enabled: bool,
}

impl TelemetryQueue {
    pub fn new(backend_url: String, enabled: bool) -> Self {
        Self {
            queue: Arc::new(Mutex::new(Vec::new())),
            backend_url,
            enabled,
        }
    }

    pub fn push(&self, event: CanonicalTelemetryEvent) {
        if !self.enabled {
            return;
        }
        let mut q = self.queue.lock().unwrap();
        if q.len() >= MAX_QUEUE_SIZE {
            q.remove(0);
        }
        q.push(event);
    }

    pub async fn start_flush_loop(self) {
        if !self.enabled {
            return;
        }
        let mut interval = time::interval(Duration::from_millis(FLUSH_INTERVAL_MS));
        loop {
            interval.tick().await;
            self.flush().await;
        }
    }

    async fn flush(&self) {
        let batch: Vec<CanonicalTelemetryEvent> = {
            let mut q = self.queue.lock().unwrap();
            if q.is_empty() {
                return;
            }
            let count = q.len().min(BATCH_SIZE);
            q.drain(0..count).collect()
        };

        let url = format!("{}/api/ingest/request", self.backend_url);
        let client = reqwest::Client::new();

        let payload = serde_json::json!({
            "events": batch,
        });

        let _ = client.post(&url).json(&payload).send().await;
    }
}
