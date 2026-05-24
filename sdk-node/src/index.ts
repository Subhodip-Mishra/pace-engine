// src/index.ts
import { PaceConfig, ProtectionMode, PaceLimitConfig, NormalizedLimitDecision, type CanonicalTelemetryEvent } from "./types/config";
import { startHeartbeat } from "./heartbeat";
import { runtimeMetrics } from "./runtime/metrics";
import { sendRuntimeMetrics } from "./runtime/sendRuntimeMetrics";
import { createPaceLogger, writeBootstrapLog } from "./core/logger";
import { evaluateLimitDecision, type LimitStateStore } from "./core/decision";
const packageJson = require("../package.json");

// load rust engine with js fallback
let paceNative: any = null;
try {
  paceNative = require("../../pace-engine/index.node");
  if (process.env.PACE_DEBUG === "true") writeBootstrapLog("[Pace] ⚡ Rust engine loaded");
} catch (e) {
  console.warn("[Pace] Rust engine not found, using JS fallback. Reason:", e);
}

// core engine
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

  constructor(options?: PaceConfig) {
    this.options = options;
    this.logger = createPaceLogger(options?.debug);

    // memory cleanup interval
    setInterval(() => {
      const now = Date.now();
      const TTL_MS = 15 * 60 * 1000;
      for (const [k, v] of this.limitStore.tokenBuckets.entries()) if ((v.lastSeenMs || v.lastRefillMs) + TTL_MS < now) this.limitStore.tokenBuckets.delete(k);
      for (const [k, v] of this.limitStore.fixedWindows.entries()) if ((v.lastSeenMs || v.windowStartMs) + TTL_MS < now) this.limitStore.fixedWindows.delete(k);
      for (const [k, v] of this.limitStore.slidingWindows.entries()) if ((v.lastSeenMs || 0) + TTL_MS < now) this.limitStore.slidingWindows.delete(k);
    }, 60000);

    // initialize rust native binding
    if (this.native?.PaceNode) {
      this.nativeEngine = new this.native.PaceNode({
        algorithm: "token_bucket",
        mode: options?.mode || "active",
        capacity: 100,
        refillRate: 10,
        apiKey: options?.apiKey,
        debug: options?.debug,
      });
    }

    // telemetry & heartbeat
    if (this.isConnected()) {
      startHeartbeat({ apiKey: options?.apiKey || "", mode: this.getMode(), algorithm: this.getAlgorithm(), sdkVersion: packageJson.version });
      setInterval(() => {
        sendRuntimeMetrics({ apiKey: options?.apiKey || "", mode: this.getMode(), algorithm: this.getAlgorithm(), sdkVersion: packageJson.version });
      }, 30000);
    }
  }

  private isConnected(): boolean { return !!this.options?.apiKey; }
  private getMode(): ProtectionMode { return this.options?.mode || "active"; }
  private getAlgorithm(): "token_bucket" { return "token_bucket"; }

  // Telemetry Builder
  public buildTelemetryEvent(params: { decision: NormalizedLimitDecision; req: any; resStatusCode: number; mode: ProtectionMode; ip: string; route: string; }): CanonicalTelemetryEvent {
    return {
      eventType: "decision", timestamp: params.decision.timestamp, apiKey: this.options?.apiKey, sdkVersion: packageJson.version, decision: params.decision,
      request: { route: params.route, ip: params.ip, method: params.req?.method || "UNKNOWN", statusCode: params.resStatusCode, latencyMs: params.decision.latencyMs, userAgent: params.req?.headers?.["user-agent"] || "", key: params.decision.key, mode: params.mode },
    };
  }

  // Core Math & Checking Logic
  public check(ip: string, route: string = "/", config: PaceLimitConfig): NormalizedLimitDecision & { allowed: boolean } {
    const start = Date.now();
    const mode = this.getMode();

    if (mode === "disabled") {
      return {
        allowed: true, decision: "allow", reason: "within_limit", remaining: 1,
        timestamp: start, latencyMs: 0, key: ip, route,
        algorithm: this.getAlgorithm(), mode
      };
    }

    let decision: NormalizedLimitDecision;
    try {
      decision = evaluateLimitDecision(config, { route, ip, identity: ip, mode, nowMs: start }, this.limitStore);
    } catch (err) {
      if (this.logger?.enabled) writeBootstrapLog(`[Pace] check() error: ${String(err)}`);
      // 2. ADDED: algorithm and mode to the catch block return
      return {
        allowed: true, decision: "allow", reason: "within_limit", remaining: 1,
        timestamp: start, latencyMs: 0, key: ip, route,
        algorithm: this.getAlgorithm(), mode
      };
    }

    decision.latencyMs = Date.now() - start;
    this.logger?.logDecision(decision);
    if (decision.decision === "would_block") runtimeMetrics.wouldBlocked++;

    return { ...decision, allowed: decision.decision !== "block" };
  }
}

export { paceExpress } from "./frameworks/express";
export { paceFastify } from "./frameworks/fastify";
export { paceNext } from "./frameworks/nextjs";