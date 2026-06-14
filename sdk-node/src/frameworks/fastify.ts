import type { Pace } from "../index";
import type { PaceLimitConfig } from "../types/config";
import { runtimeMetrics } from "../runtime/metrics";
import { enqueueTelemetry } from "../telemetry/telemetry-queue";
import { shouldIgnoreRoute } from "../core/logger";

export function paceFastify(pace: Pace, config: PaceLimitConfig) {
  return async (request: any, reply: any) => {
    const ip =
      request.headers?.["cf-connecting-ip"] ||
      request.headers?.["x-real-ip"] ||
      (request.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      request.ip ||
      "127.0.0.1";
    const route = request.routerPath || request.url;

    if (shouldIgnoreRoute(route)) return;

    const result = pace.check(ip, route, config);

    if (!result.allowed) {
      runtimeMetrics.blocked++;
      runtimeMetrics.requests++;
      if (pace.isConnected()) {
        enqueueTelemetry(pace.buildTelemetryEvent({
          decision: result, req: request, resStatusCode: 429,
          mode: pace.getMode(), ip, route,
        }));
      }
      return reply.status(429).send({ error: "Too Many Requests" });
    }

    runtimeMetrics.requests++;
    runtimeMetrics.totalLatency += result.latencyMs ?? 0;
    if (pace.isConnected()) {
      enqueueTelemetry(pace.buildTelemetryEvent({
        decision: result, req: request, resStatusCode: 200,
        mode: pace.getMode(), ip, route,
      }));
    }
  };
}