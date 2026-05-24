// src/frameworks/fastify.ts

// 1. Import the types and the core Pace class 
import type { Pace } from "../index"; // Or "../core/pace" if you moved the Pace class there
import type { PaceLimitConfig } from "../types/config";

// 2. Import the internal utilities that the skin needs
import { runtimeMetrics } from "../runtime/metrics";
import { enqueueTelemetry } from "../telemetry/telemetry-queue";
import { shouldIgnoreRoute } from "../core/logger";

export function paceFastify(pace: Pace, config: PaceLimitConfig) {
  return async (request: any, reply: any) => {
    // Extract IP and Route
    const ip = request.ip || "127.0.0.1";
    const route = request.routerPath || request.url;

    if (shouldIgnoreRoute(route)) return;

    // Call the core engine
    const result = pace.check(ip, route, config);

    // Handle block
    if (!result.allowed) {
      runtimeMetrics.blocked++;
      runtimeMetrics.requests++;
      
      // Note: We use pace["isConnected"]() to access private methods, 
      // or you can make them public in your Pace class.
      if (pace["isConnected"]()) {
        enqueueTelemetry(pace.buildTelemetryEvent({ 
          decision: result, req: request, resStatusCode: 429, mode: pace["getMode"](), ip, route 
        }));
      }
      return reply.status(429).send({ message: "Rate limit exceeded" });
    }

    // Handle allow
    runtimeMetrics.requests++;
 runtimeMetrics.totalLatency += (result.latencyMs ?? 0);
    
    if (pace["isConnected"]()) {
      enqueueTelemetry(pace.buildTelemetryEvent({ 
        decision: result, req: request, resStatusCode: 200, mode: pace["getMode"](), ip, route 
      }));
    }
  };
}