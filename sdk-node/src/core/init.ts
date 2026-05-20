import { PaceConfig } from "../types/config";

export function init(config: PaceConfig) {
  const mode = config.mode || "active";

  console.log("[Pace] Initializing...");
  console.log(`[Pace] Mode: ${mode}`);

  if (config.apiKey) {
    console.log("[Pace] Connected mode enabled");
  } else {
    console.log("[Pace] Running in local mode");
  }

  return {
    mode,
    connected: !!config.apiKey,
  };
}