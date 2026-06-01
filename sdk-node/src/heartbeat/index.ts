import { spawn } from "child_process";
import * as path from "node:path";
import * as fs from "node:fs";

let heartbeatProcess: any = null;

export function startHeartbeat(config: {
  apiKey: string;
  mode: string;
  algorithm: string;
  sdkVersion: string;
  ingestUrl?: string;
}) {
  if (heartbeatProcess) {
    return;
  }

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
  ]);

  heartbeatProcess.stdout.on(
    "data",
    (data: Buffer) => {
      console.log(
        "[heartbeat]",
        data.toString()
      );
    }
  );

  heartbeatProcess.stderr.on(
    "data",
    (data: Buffer) => {
      console.error(
        "[heartbeat error]",
        data.toString()
      );
    }
  );

  heartbeatProcess.on(
    "close",
    (code: number) => {
      console.log(
        `[heartbeat exited]: ${code}`
      );
    }
  );
}