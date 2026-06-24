import { spawn } from "child_process";
import * as path from "node:path";
import * as fs from "node:fs";

let heartbeatProcess: any = null;
let activeConfig: any = null;

export function startHeartbeat(config: {
  apiKey: string;
  mode: string;
  algorithm: string;
  sdkVersion: string;
  ingestUrl?: string;
  requestsPerWindow?: number;
  windowSeconds?: number;
}) {
  if (
    heartbeatProcess &&
    activeConfig &&
    activeConfig.apiKey === config.apiKey &&
    activeConfig.mode === config.mode &&
    activeConfig.algorithm === config.algorithm &&
    activeConfig.requestsPerWindow === config.requestsPerWindow &&
    activeConfig.windowSeconds === config.windowSeconds
  ) {
    return;
  }

  if (heartbeatProcess) {
    try {
      heartbeatProcess.kill();
    } catch (e) {}
  }

  activeConfig = { ...config };

  const candidates = [
    path.resolve(__dirname, "../../../src/heartbeat/target/debug/heartbeat"),
    path.resolve(__dirname, "../../src/heartbeat/target/debug/heartbeat"),
    path.resolve(__dirname, "../src/heartbeat/target/debug/heartbeat"),
    "/home/suvodeep-mishra/Desktop/pace/sdk-node/src/heartbeat/target/debug/heartbeat"
  ];

  let rustPath = "";
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      rustPath = candidate;
      break;
    }
  }
  if (!rustPath) {
    rustPath = candidates[candidates.length - 1];
  }

  heartbeatProcess = spawn(rustPath, [
    config.apiKey,
    config.mode,
    config.algorithm,
    config.sdkVersion,
    config.ingestUrl || "http://localhost:4001",
    "0",
    "0",
    "0",
    String(config.requestsPerWindow ?? 100),
    String(config.windowSeconds ?? 60),
  ]);

}