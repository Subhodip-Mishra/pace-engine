import { spawn } from "child_process";

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

  const rustPath =
    "/home/suvodeep-mishra/Desktop/pace-rate-limiter/packages/nodejs/src/heartbeat/target/debug/heartbeat";

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