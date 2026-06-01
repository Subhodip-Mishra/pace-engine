import type { Pace } from "../index";
import type { PaceLimitConfig } from "../types/config";
import { runtimeMetrics } from "../runtime/metrics";
import { enqueueTelemetry } from "../telemetry/telemetry-queue";
import { shouldIgnoreRoute } from "../core/logger";

export function paceExpress(pace: Pace, config: PaceLimitConfig) {
  return (req: any, res: any, next: any) => {
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      "127.0.0.1";
    const route = req.originalUrl || req.path || "unknown";

    if (shouldIgnoreRoute(route)) return next();

    const result = pace.check(ip, route, config);

    if (!result.allowed) {
      runtimeMetrics.blocked++;
      runtimeMetrics.requests++;
      if (pace.isConnected()) {
        enqueueTelemetry(pace.buildTelemetryEvent({
          decision: result, req, resStatusCode: 429,
          mode: pace.getMode(), ip, route,
        }));
      }
      return res.status(429).json({ error: "Too Many Requests" });
    }

    res.on("finish", () => {
      runtimeMetrics.requests++;
      runtimeMetrics.totalLatency += result.latencyMs ?? 0;
      if (pace.isConnected()) {
        enqueueTelemetry(pace.buildTelemetryEvent({
          decision: result, req, resStatusCode: res.statusCode,
          mode: pace.getMode(), ip, route,
        }));
      }
    });

    next();
  };
}