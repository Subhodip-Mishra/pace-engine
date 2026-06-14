import { PaceConfig, ProtectionMode, PaceLimitConfig, NormalizedLimitDecision, type CanonicalTelemetryEvent, type Algorithm } from "./types/config";
import { startHeartbeat } from "./heartbeat";
import { runtimeMetrics } from "./runtime/metrics";
import { sendRuntimeMetrics } from "./runtime/sendRuntimeMetrics";
import { createPaceLogger, writeBootstrapLog } from "./core/logger";
import { evaluateLimitDecision, type LimitStateStore } from "./core/decision";
import { enqueueTelemetry } from "./telemetry/telemetry-queue";
import * as path from "node:path";
const packageJson = require("../package.json");
import { randomUUID } from "node:crypto";

let paceNative: any = null;
try {
  const nativeCandidates = [
    path.resolve(__dirname, "../../pace-engine/index.node"),
    path.resolve(process.cwd(), "../pace-engine/index.node"),
    path.resolve(process.cwd(), "pace-engine/index.node"),
  ];

  for (const candidate of nativeCandidates) {
    try {
      paceNative = require(candidate);
      break;
    } catch {
      // try the next candidate
    }
  }

  if (!paceNative) {
    throw new Error(`Cannot find native module. Tried: ${nativeCandidates.join(", ")}`);
  }

  if (process.env.PACE_DEBUG === "true") writeBootstrapLog("[Pace] ⚡ Rust engine loaded");
} catch (e) {
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
    leakyBuckets: new Map(),
    slidingWindows: new Map(),
  };

  constructor(options?: PaceConfig) {
    this.options = options;
    this.logger = createPaceLogger(options?.debug);

    setInterval(() => {
      const now = Date.now();
      const TTL = 15 * 60 * 1000;
      for (const [k, v] of this.limitStore.tokenBuckets.entries())
        if ((v.lastSeenMs || v.lastRefillMs) + TTL < now) this.limitStore.tokenBuckets.delete(k);
      for (const [k, v] of this.limitStore.fixedWindows.entries())
        if ((v.lastSeenMs || v.windowStartMs) + TTL < now) this.limitStore.fixedWindows.delete(k);
      for (const [k, v] of this.limitStore.leakyBuckets.entries())
        if ((v.lastSeenMs || v.lastLeakMs) + TTL < now) this.limitStore.leakyBuckets.delete(k);
      for (const [k, v] of this.limitStore.slidingWindows.entries())
        if ((v.lastSeenMs || 0) + TTL < now) this.limitStore.slidingWindows.delete(k);
    }, 60000);

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

    if (this.isConnected()) {
      startHeartbeat({ 
        apiKey: options?.apiKey || "", 
        mode: this.getMode(), 
        algorithm: this.getAlgorithm(), 
        sdkVersion: packageJson.version,
        requestsPerWindow: options?.requestsPerWindow ?? 100,
        windowSeconds: options?.windowSeconds ?? 60,
      });
      setInterval(() => {
        sendRuntimeMetrics({ 
          apiKey: options?.apiKey || "", 
          mode: this.getMode(), 
          algorithm: this.getAlgorithm(), 
          sdkVersion: packageJson.version });
      }, 30000);
    }
  }

  public isConnected(): boolean { return !!this.options?.apiKey; }
  public getMode(): ProtectionMode { return this.options?.mode || "active"; }
  private getAlgorithm(): Algorithm { return this.options?.algorithm || "sliding_window"; }

  public buildTelemetryEvent(params: {
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
        requestId: randomUUID(),
        route: params.route,
        ip: params.ip,
        method: params.req?.method || "UNKNOWN",
        statusCode: params.resStatusCode,
        latencyMs: params.decision.latencyMs ?? 0,
        userAgent: params.req?.headers?.["user-agent"] || "",
        key: params.decision.key,
        mode: params.mode,
      },
    };
  }

  public check(
    ip: string,
    route: string = "/",
    config: PaceLimitConfig
  ): NormalizedLimitDecision & { allowed: boolean } {
    if (this.isConnected()) {
      const limitAlgorithm = config.algorithm || "sliding_window";
      let requestsPerWindow = 100;
      let windowSeconds = 60;

      if ("limit" in config) {
        requestsPerWindow = (config as any).limit;
      } else if ("capacity" in config) {
        requestsPerWindow = (config as any).capacity;
      }

      if ("window" in config && typeof (config as any).window === "string") {
        const match = (config as any).window.match(/^(\d+)([smhd])$/);
        if (match) {
          const val = parseInt(match[1], 10);
          const unit = match[2];
          if (unit === "s") windowSeconds = val;
          else if (unit === "m") windowSeconds = val * 60;
          else if (unit === "h") windowSeconds = val * 3600;
          else if (unit === "d") windowSeconds = val * 86400;
        }
      }

      startHeartbeat({
        apiKey: this.options?.apiKey || "",
        mode: this.getMode(),
        algorithm: limitAlgorithm,
        sdkVersion: packageJson.version,
        requestsPerWindow,
        windowSeconds,
      });
    }

    const start = Date.now();
    const mode = this.getMode();

    if (mode === "disabled") {
      return {
        allowed: true, decision: "allow", reason: "within_limit", remaining: 1,
        timestamp: start, latencyMs: 0, key: ip, route,
        algorithm: this.getAlgorithm(), mode,
      };
    }

    let decision: NormalizedLimitDecision;
    try {
      decision = evaluateLimitDecision(
        config,
        { route, ip, identity: ip, mode, nowMs: start },
        this.limitStore
      );
    } catch (err) {
      if (this.logger?.enabled) writeBootstrapLog(`[Pace] check() error: ${String(err)}`);
      return {
        allowed: true, decision: "allow", reason: "within_limit", remaining: 1,
        timestamp: start, latencyMs: 0, key: ip, route,
        algorithm: this.getAlgorithm(), mode,
      };
    }

    decision.latencyMs = Date.now() - start;
    this.logger?.logDecision(decision);
    if (decision.decision === "would_block") runtimeMetrics.wouldBlocked++;

    return { ...decision, allowed: decision.decision !== "block" };
  }

  public limit(config: PaceLimitConfig) {
    return (req: any, res: any, next: any) => {
      const ip =
        req.headers?.["cf-connecting-ip"] ||
        req.headers?.["x-real-ip"] ||
        (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.ip ||
        req.socket?.remoteAddress ||
        "127.0.0.1";

      const route = req.originalUrl || req.path || "unknown";
      const identity = "key" in config && config.key ? config.key(req) : ip;
      const result = this.check(identity, route, config);

      if (!result.allowed) {
        runtimeMetrics.blocked++;
        runtimeMetrics.requests++;

        if (this.isConnected()) {
          enqueueTelemetry(
            this.buildTelemetryEvent({
              decision: result, req, resStatusCode: 429,
              mode: this.getMode(), ip, route,
            })
          );
        }

        return res.status(429).json({
          error: "Too Many Requests",
          retryAfter: result.resetMs ? Math.ceil(result.resetMs / 1000) : null,
        });
      }

      res.on("finish", () => {
        runtimeMetrics.requests++;
        runtimeMetrics.totalLatency += result.latencyMs ?? 0;

        if (this.isConnected()) {
          enqueueTelemetry(
            this.buildTelemetryEvent({
              decision: result, req, resStatusCode: res.statusCode,
              mode: this.getMode(), ip, route,
            })
          );
        }
      });

      next();
    };
  }
}

export { paceExpress } from "./frameworks/express";
export { paceFastify } from "./frameworks/fastify";
export { paceNext } from "./frameworks/nextjs";
export type { PaceLimitConfig, PaceConfig, ProtectionMode, Algorithm } from "./types/config";