use serde::Serialize;
use std::time::{Duration, Instant};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SDKConfig {
    algorithm: String,
    requestsPerWindow: i32,
    windowSeconds: i32,
    mode: String,
    sdkVersion: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HeartbeatPayload {
    apiKey: String,
    sdkVersion: String,
    mode: String,
    algorithm: String,
    requestsLastMinute: String,
    blockedLastMinute: String,
    avgLatencyMs: String,
    uptime: u64,
    sdkConfig: SDKConfig,
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();

    let api_key = args.get(1).cloned().unwrap_or("".to_string());

    let mode = args.get(2).cloned().unwrap_or("active".to_string());

    let algorithm = args.get(3).cloned().unwrap_or("token_bucket".to_string());

    let sdk_version = args.get(4).cloned().unwrap_or("0.1.0".to_string());

    let ingest_url = args.get(5).cloned().unwrap_or("http://localhost:4001".to_string());

    let requests_last_minute = args.get(6).cloned().unwrap_or("0".to_string());

    let blocked_last_minute = args.get(7).cloned().unwrap_or("0".to_string());

    let avg_latency_ms = args.get(8).cloned().unwrap_or("0".to_string());

    let req_per_window = args.get(9)
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(100);

    let window_seconds = args.get(10)
        .and_then(|s| s.parse::<i32>().ok())
        .unwrap_or(60);

    let started_at = Instant::now();

    loop {
        let uptime = started_at.elapsed().as_secs();

        let payload = HeartbeatPayload {
            apiKey: api_key.clone(),
            sdkVersion: sdk_version.clone(),
            mode: mode.clone(),
            algorithm: algorithm.clone(),
            requestsLastMinute: requests_last_minute.clone(),
            blockedLastMinute: blocked_last_minute.clone(),
            avgLatencyMs: avg_latency_ms.clone(),
            uptime,
            sdkConfig: SDKConfig {
                algorithm: algorithm.clone(),
                requestsPerWindow: req_per_window,
                windowSeconds: window_seconds,
                mode: mode.clone(),
                sdkVersion: sdk_version.clone(),
            },
        };

        let client = reqwest::Client::new();

        let response = client
            .post(format!("{}/api/heartbeat", ingest_url))
            .json(&payload)
            .send()
            .await;

        match response {
            Ok(_) => {
                // println!("Heartbeat sent successfully")
            }

            Err(error) => {
                // println!("Heartbeat failed to send: {}", error)
            }
        }
        tokio::time::sleep(
            Duration::from_secs(5)
        ).await;
    }
}
