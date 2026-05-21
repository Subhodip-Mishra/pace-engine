export type ProtectionMode = "active" | "shadow" | "disabled";

export type Algorithm = "token_bucket" | "sliding_window" | "fixed_window";

export type DebugMode = "compact" | "pretty";

export type TrafficDecision = "allow" | "block" | "would_block";

export type DecisionReason = "within_limit" | "limit_exceeded" | "token_exhausted";

export interface PaceConfig {
  apiKey?: string;
  mode?: ProtectionMode;
  debug?: DebugMode;
}

export interface CanonicalDecision {
  decision: TrafficDecision;
  reason: DecisionReason;
  algorithm: Algorithm;
  route: string;
  key?: string;
  remaining?: number;
  resetMs?: number;
  latencyMs?: number;
  mode: ProtectionMode;
  timestamp: number;
  ip?: string;
  window?: string;
  limit?: number;
  capacity?: number;
  refillRate?: number;
  refillMs?: number;
}

export interface CanonicalTelemetryRequest {
  route: string;
  ip: string;
  method?: string;
  statusCode?: number;
  latencyMs?: number;
  userAgent?: string;
  key?: string;
  mode: ProtectionMode;
}

export interface CanonicalTelemetryEvent {
  eventType: "decision";
  timestamp: number;
  apiKey?: string;
  sdkVersion?: string;
  decision: CanonicalDecision;
  request: CanonicalTelemetryRequest;
}

export type TokenBucketConfig = {
  algorithm: "token_bucket";
  capacity: number;
  refillRate: number;
  key?: (req: any) => string;
};

export type FixedWindowConfig = {
  algorithm: "fixed_window";

  limit: number;
  window: string;
  key?: (req: any) => string;
};

export type SlidingWindowConfig = {
  algorithm: "sliding_window";

  limit: number;
  window: string;
  key?: (req: any) => string;
};

export type PaceLimitConfig = TokenBucketConfig | FixedWindowConfig | SlidingWindowConfig;

export type NormalizedLimitDecision = CanonicalDecision;