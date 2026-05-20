import { sendTelemetry } from "./sendTelemetry";
import type { CanonicalTelemetryEvent } from "../types/config";

const queue: CanonicalTelemetryEvent[] = [];

const MAX_QUEUE_SIZE = 10000;  // ← ADD

export function enqueueTelemetry(event: CanonicalTelemetryEvent) {
  if (queue.length >= MAX_QUEUE_SIZE) {
    queue.shift();
  }
  queue.push(event);
}

setInterval(async () => {
  if (queue.length === 0) {
    return;
  }

  const batch = queue.splice(0, 500);

  try {
    await sendTelemetry(batch);

    console.log(
      `[Pace] Flushed ${batch.length} telemetry events`
    );

  } catch (error) {
    console.error(
      "[Pace] Queue flush failed:",
      error
    );
  }
}, 2000);