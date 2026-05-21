import { PaceConfig, ProtectionMode, PaceLimitConfig, NormalizedLimitDecision, type CanonicalTelemetryEvent } from "./types/config";
import { startHeartbeat } from "./heartbeat";
import { runtimeMetrics } from "./runtime/metrics";
import { sendRuntimeMetrics } from "./runtime/sendRuntimeMetrics";
import { enqueueTelemetry } from "./telemetry/telemetry-queue";
import { createPaceLogger, shouldIgnoreRoute, writeBootstrapLog, normalizeDebugMode } from "./core/logger";
import { evaluateLimitDecision, type LimitStateStore } from "./core/decision";

const path = require("path");
const packageJson = require("../package.json");

// Try Rust engine first; if not present, fall back to JS only
let paceNative: any = null;

try {
  paceNative = require("../../pace-engine/index.node");
  if (process.env.PACE_DEBUG === "true") {
    writeBootstrapLog("[Pace] ⚡ Rust engine loaded");
  }
} catch (e){
  // Rust engine not found — use JS fallback only
  console.warn("[Pace] Rust engine not found, using JS fallback. Reason:", e);
}

export class Pace {
  private options?: PaceConfig;
  private logger: ReturnType<typeof createPaceLogger> | null = null;
  private native = paceNative;
  private nativeEngine: any = null;
  private limitStore: LimitStateStore = {
    tokenBuckets: new Map(),
    fixedWindows: new Map(),
    slidingWindows: new Map(),
  };
  private jsBuckets: Map<string, { tokens: number; last: number }> = new Map();

  private buildTelemetryEvent(params: {
    decision: NormalizedLimitDecision;
    req: any;
    resStatusCode: number;
    mode: ProtectionMode;
    ip: string;
    route: string;
  }): CanonicalTelemetryEvent {
    return {
      eventType: "decision",
      timestamp: params.decision.timestamp,
      apiKey: this.options?.apiKey,
      sdkVersion: packageJson.version,
      decision: params.decision,
      request: {
        route: params.route,
        ip: params.ip,
        method: params.req.method,
        statusCode: params.resStatusCode,
        latencyMs: params.decision.latencyMs,
        userAgent: params.req.headers["user-agent"],
        key: params.decision.key,
        mode: params.mode,
      },
    };
  }

 constructor(options?: PaceConfig) {
    this.options = options;
    
    // 1. UPDATED: Pass only the single debug property
    this.logger = createPaceLogger(options?.debug);
    
    // Periodic cleanup of stale limiter state to avoid unbounded memory growth
    const TTL_MS = 15 * 60 * 1000; // 15 minutes
    const CLEANUP_INTERVAL_MS = 60 * 1000; // 1 minute
    setInterval(() => {
      const now = Date.now();

      for (const [k, v] of this.limitStore.tokenBuckets.entries()) {
        if ((v.lastSeenMs || v.lastRefillMs) + TTL_MS < now) this.limitStore.tokenBuckets.delete(k);
      }

      for (const [k, v] of this.limitStore.fixedWindows.entries()) {
        if ((v.lastSeenMs || v.windowStartMs) + TTL_MS < now) this.limitStore.fixedWindows.delete(k);
      }

      for (const [k, v] of this.limitStore.slidingWindows.entries()) {
        if ((v.lastSeenMs || 0) + TTL_MS < now) this.limitStore.slidingWindows.delete(k);
      }
    }, CLEANUP_INTERVAL_MS);

    // 2. UPDATED: Initialize Rust engine with the new string debug field
    if (this.native?.PaceNode) {
      this.nativeEngine = new this.native.PaceNode({
        algorithm: "token_bucket",
        mode: options?.mode || "active",
        capacity: 100,
        refillRate: 10,
        apiKey: options?.apiKey,
        debug: options?.debug, // <--- Passes "compact", "pretty", or undefined
      });
    }

    if (this.isConnected()) {
      startHeartbeat({
        apiKey: options?.apiKey || "",
        mode: this.getMode(),
        algorithm: this.getAlgorithm(),
        sdkVersion: packageJson.version,
        // ingestUrl intentionally omitted from public config; heartbeat uses internal default
      });

      setInterval(() => {
        sendRuntimeMetrics({
          apiKey: options?.apiKey || "",
          mode: this.getMode(),
          algorithm: this.getAlgorithm(),
          sdkVersion: packageJson.version,
          // ingestUrl intentionally omitted from public config; sendRuntimeMetrics uses internal default
        });
      }, 30000);
    }
  }

  private isConnected(): boolean {
    return !!this.options?.apiKey;
  }

  private getMode(): ProtectionMode {
    return this.options?.mode || "active";
  }

  private getAlgorithm() {
    return "token_bucket";
  }

  // JS fallback rate limiter
  private jsFallbackCheck(ip: string, capacity: number): boolean {
    const now = Date.now();
    const bucket = this.jsBuckets.get(ip) || { tokens: capacity, last: now };
    const elapsed = (now - bucket.last) / 1000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * 10);
    bucket.last = now;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      this.jsBuckets.set(ip, bucket);
      return true;
    }
    this.jsBuckets.set(ip, bucket);
    return false;
  }

  // Backward-compatible API used by existing examples/consumers.
  public checkBatch(ips: string[], cap: number, rate: number, orgId: string): boolean[] {
    if (this.native?.checkBatch) {
      return this.native.checkBatch(ips, cap, rate, orgId, this.getAlgorithm());
    }

    return ips.map((ip) => this.jsFallbackCheck(ip, cap));
  }

  public limit(config: PaceLimitConfig) {
    return (req: any, res: any, next: any) => {
      const start = Date.now();
      const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        "unknown";
      const route = req.originalUrl || req.path || req.url || "unknown";

      if (shouldIgnoreRoute(route)) {
        return next();
      }

      const mode = this.getMode();
      if (mode === "disabled") {
        return next();
      }

      let decision: NormalizedLimitDecision;

      try {
        const resolvedKey = (config as any).key ? (config as any).key(req) : ip;
        decision = evaluateLimitDecision(
          config,
          {
            route,
            ip,
            identity: resolvedKey,
            mode,
            nowMs: start,
          },
          this.limitStore
        );
      } catch (err) {
        if (this.logger?.enabled) {
          writeBootstrapLog(`[Pace] limit() validation error: ${String(err)}`);
        }
        return next();
      }

      if (decision.decision === "block") {
        decision.latencyMs = Date.now() - start;
        this.logger!.logDecision(decision);
        runtimeMetrics.blocked++;
        runtimeMetrics.requests++;

        if (this.isConnected()) {
          enqueueTelemetry({
            ...this.buildTelemetryEvent({
              decision,
              req,
              resStatusCode: 429,
              mode,
              ip,
              route,
            }),
          });
        }

        return res.status(429).json({ message: "Rate limit exceeded" });
      }

      if (decision.decision === "would_block") {
        runtimeMetrics.wouldBlocked++;
      }

      res.on("finish", async () => {
        decision.latencyMs = Date.now() - start;
        runtimeMetrics.requests++;
        runtimeMetrics.totalLatency += decision.latencyMs;
        this.logger!.logDecision(decision);

        if (this.isConnected()) {
          enqueueTelemetry({
            ...this.buildTelemetryEvent({
              decision,
              req,
              resStatusCode: res.statusCode,
              mode,
              ip,
              route,
            }),
          });
        }
      });

      next();
    };
  }
}