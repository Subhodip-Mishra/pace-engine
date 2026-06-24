import type { CanonicalTelemetryEvent } from "../types/config";

const ingestUrl = process.env.PACE_INGEST_URL ?? "http://localhost:4001";

export async function sendTelemetry(
  events: CanonicalTelemetryEvent[],
) {
  try {
    await fetch(
      `${ingestUrl}/api/ingest/request`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-pace-key": events[0]?.apiKey ?? "",
        },
        body: JSON.stringify({ events }),
      }
    );
    // console.log(
    //   `[Pace] Sent ${events.length} telemetry events`
    // );

  } catch (error) {
    if (process.env.PACE_DEBUG) {
      console.error("[Pace] Telemetry failed:", error);
    }
  }
}