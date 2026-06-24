import { runtimeMetrics } from "./metrics";


export async function sendRuntimeMetrics(config: {
    apiKey: string;
    mode: string;
    algorithm: string;
    sdkVersion: string;
    ingestUrl?: string;
}) {
    const avgLatency = runtimeMetrics.requests === 0
        ? 0
        : runtimeMetrics.totalLatency / runtimeMetrics.requests;

    const payload = {
        apiKey: config.apiKey,
        sdkVersion: config.sdkVersion,
        mode: config.mode,
        algorithm: config.algorithm,
        wouldBlockLastMinute: runtimeMetrics.wouldBlocked,
        requestsLastMinute: runtimeMetrics.requests,
        blockedLastMinute: runtimeMetrics.blocked,
        avgLatencyMs: Number(avgLatency.toFixed(2))
    }

    try {
        await fetch(`${config.ingestUrl || "http://localhost:4001"}/api/runtime/metrics`, {
            method: 'POST',
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        // console.log("Runtime metrics sent:", payload);

        runtimeMetrics.requests = 0;
        runtimeMetrics.blocked = 0;
        runtimeMetrics.wouldBlocked = 0;
        runtimeMetrics.totalLatency = 0;
    }
    catch (error) {
        console.error("Failed to send runtime metrics:", error);
    }
}