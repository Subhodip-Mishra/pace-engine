import type { CanonicalTelemetryEvent } from "../types/config";

const ingestUrl = "http://localhost:4001";

export async function sendTelemetry(
  events: CanonicalTelemetryEvent[],
) {
  try {
    await fetch(
      `${ingestUrl}/api/ingest/request`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json",
        },

        body: JSON.stringify({
          events
        }),
      }
    );

    console.log(
      `[Pace] Sent ${events.length} telemetry events`
    );

  } catch (error) {
    console.error(
      "[Pace] Telemetry failed:",
      error
    );
  }
}