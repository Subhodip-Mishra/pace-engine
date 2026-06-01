// src/frameworks/nextjs.ts

// 1. Import the types and the core Pace class 
import type { Pace } from "../index"; // Or "../core/pace" if you moved the Pace class there
import type { PaceLimitConfig } from "../types/config";

// 2. Import the internal utilities that the skin needs
import { runtimeMetrics } from "../runtime/metrics";
import { enqueueTelemetry } from "../telemetry/telemetry-queue";
import { shouldIgnoreRoute } from "../core/logger";


export function paceNext(pace: Pace, config: PaceLimitConfig) {
  return async (req: Request) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
    const url = new URL(req.url);
    const route = url.pathname;

    // ADD THIS — was missing
    if (shouldIgnoreRoute(route)) return null;

    const result = pace.check(ip, route, config);

    if (!result.allowed) {
      runtimeMetrics.blocked++;
      runtimeMetrics.requests++;
      if (pace.isConnected()) {
        enqueueTelemetry(pace.buildTelemetryEvent({
          decision: result,
          req: { method: req.method, headers: Object.fromEntries(req.headers) },
          resStatusCode: 429,
          mode: pace.getMode(),
          ip,
          route,
        }));
      }
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    runtimeMetrics.requests++;
    runtimeMetrics.totalLatency += result.latencyMs ?? 0;

    if (pace.isConnected()) {
      enqueueTelemetry(pace.buildTelemetryEvent({
        decision: result,
        req: { method: req.method, headers: Object.fromEntries(req.headers) },
        resStatusCode: 200,
        mode: pace.getMode(),
        ip,
        route,
      }));
    }

    return null;
  };
}