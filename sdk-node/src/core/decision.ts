import type {
  Algorithm,
  LeakyBucketConfig,
  FixedWindowConfig,
  DecisionReason,
  NormalizedLimitDecision,
  PaceLimitConfig,
  ProtectionMode,
  SlidingWindowConfig,
  TokenBucketConfig,
  TrafficDecision,
} from "../types/config";

export interface TokenBucketState {
  tokens: number;
  lastRefillMs: number;
  lastSeenMs?: number;
}

export interface FixedWindowState {
  windowStartMs: number;
  count: number;
  lastSeenMs?: number;
}

export interface LeakyBucketState {
  waterLevel: number;
  lastLeakMs: number;
  lastSeenMs?: number;
}

export interface LimitStateStore {
  tokenBuckets: Map<string, TokenBucketState>;
  fixedWindows: Map<string, FixedWindowState>;
  leakyBuckets: Map<string, LeakyBucketState>;
  slidingWindows: Map<string, { timestamps: number[]; lastSeenMs?: number }>;
}

export interface LimitContext {
  route: string;
  ip: string;
  identity?: string;
  mode: ProtectionMode;
  nowMs: number;
  latencyMs?: number;
}

export function parseDurationMs(value: string): number {
  const match = value.match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    throw new Error(`invalid window format: ${value}`);
  }

  const amount = Number(match[1]);
  const unit = match[2];

  if (unit === "ms") return amount;
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  return amount * 60 * 60 * 1000;
}

export function isNoisyRoute(route: string): boolean {
  return (
    route === "/favicon.ico" ||
    route === "/health" ||
    route === "/api/health" ||
    route === "/healthz" ||
    route === "/ping" ||
    route === "/api/ping" ||
    route.startsWith("/_next")
  );
}

function buildDecision(
  config: Pick<PaceLimitConfig, "algorithm">,
  context: LimitContext,
  allowed: boolean,
  reason: DecisionReason,
  remaining?: number,
  resetMs?: number,
  refillMs?: number,
  extra?: Partial<NormalizedLimitDecision>
): NormalizedLimitDecision {
  const decision: TrafficDecision = allowed ? "allow" : context.mode === "shadow" ? "would_block" : "block";

  return {
    decision,
    reason,
    algorithm: config.algorithm,
    route: context.route,
    ip: context.ip,
    key: context.identity,
    mode: context.mode,
    timestamp: Math.floor(context.nowMs / 1000),
    remaining,
    resetMs,
    refillMs,
    latencyMs: context.latencyMs,
    ...extra,
  };
}

export function evaluateLimitDecision(
  config: PaceLimitConfig,
  context: LimitContext,
  store: LimitStateStore
): NormalizedLimitDecision {
  if (config.algorithm === "token_bucket") {
    return evaluateTokenBucket(config, context, store);
  }

  if (config.algorithm === "leaky_bucket") {
    return evaluateLeakyBucket(config, context, store);
  }

  if (config.algorithm === "fixed_window") {
    return evaluateFixedWindow(config, context, store);
  }

  return evaluateSlidingWindow(config, context, store);
}

function evaluateTokenBucket(
  config: TokenBucketConfig,
  context: LimitContext,
  store: LimitStateStore
): NormalizedLimitDecision {
  const id = context.identity || context.ip;
  const key = `${id}::${context.route}`;
  const nowMs = context.nowMs;
  const refillRate = config.refillRate;
  const capacity = config.capacity;

  let state = store.tokenBuckets.get(key);
  if (!state) {
    state = { tokens: capacity, lastRefillMs: nowMs };
  }

  const elapsedMs = nowMs - state.lastRefillMs;
  if (elapsedMs > 0 && refillRate > 0) {
    state.tokens = Math.min(capacity, state.tokens + (elapsedMs * refillRate) / 1000);
  }
  state.lastRefillMs = nowMs;

  const allowed = state.tokens >= 1;
  let remaining = 0;
  let refillMs: number | undefined;

  if (allowed) {
    state.tokens -= 1;
    remaining = Math.max(0, Math.floor(state.tokens));
    if (refillRate > 0 && state.tokens < capacity) {
      refillMs = Math.max(0, Math.ceil(((1 - (state.tokens % 1)) / refillRate) * 1000));
    }
    state.lastSeenMs = nowMs;
    store.tokenBuckets.set(key, state);
    return buildDecision(
      config,
      context,
      true,
      "within_limit",
      remaining,
      undefined,
      refillMs,
      { capacity, refillRate }
    );
  }

  if (refillRate > 0) {
    const deficit = 1 - state.tokens;
    refillMs = Math.max(0, Math.ceil((deficit / refillRate) * 1000));
  }

  state.lastSeenMs = nowMs;
  store.tokenBuckets.set(key, state);
  return buildDecision(
    config,
    context,
    false,
    "token_exhausted",
    0,
    undefined,
    refillMs,
    { capacity, refillRate }
  );
}

function evaluateFixedWindow(
  config: FixedWindowConfig,
  context: LimitContext,
  store: LimitStateStore
): NormalizedLimitDecision {
  const windowMs = parseDurationMs(config.window);
  const id = context.identity || context.ip;
  const key = `${id}::${context.route}`;
  const nowMs = context.nowMs;

  let state = store.fixedWindows.get(key);
  if (!state || nowMs - state.windowStartMs >= windowMs) {
    state = { windowStartMs: nowMs, count: 0 };
  }

  const resetMs = Math.max(0, windowMs - (nowMs - state.windowStartMs));
  const allowed = state.count < config.limit;

  if (allowed) {
    state.count += 1;
    state.lastSeenMs = nowMs;
    store.fixedWindows.set(key, state);
    return buildDecision(config, context, true, "within_limit", config.limit - state.count, resetMs, undefined, {
      window: config.window,
      limit: config.limit,
    });
  }
  state.lastSeenMs = nowMs;
  store.fixedWindows.set(key, state);
  return buildDecision(config, context, false, "limit_exceeded", 0, resetMs, undefined, {
    window: config.window,
    limit: config.limit,
  });
}

function evaluateLeakyBucket(
  config: LeakyBucketConfig,
  context: LimitContext,
  store: LimitStateStore
): NormalizedLimitDecision {
  const id = context.identity || context.ip;
  const key = `${id}::${context.route}`;
  const nowMs = context.nowMs;
  const leakRate = config.refillRate;
  const capacity = config.capacity;

  let state = store.leakyBuckets.get(key);
  if (!state) {
    state = { waterLevel: 0, lastLeakMs: nowMs };
  }

  const elapsedMs = nowMs - state.lastLeakMs;
  if (elapsedMs > 0 && leakRate > 0) {
    state.waterLevel = Math.max(0, state.waterLevel - (elapsedMs * leakRate) / 1000);
  }
  state.lastLeakMs = nowMs;

  const allowed = state.waterLevel < capacity;

  if (allowed) {
    state.waterLevel += 1;
    state.lastSeenMs = nowMs;
    store.leakyBuckets.set(key, state);

    const remaining = Math.max(0, Math.floor(capacity - state.waterLevel));

    return buildDecision(config, context, true, "within_limit", remaining, undefined, undefined, {
      capacity,
      refillRate: leakRate,
    });
  }

  state.lastSeenMs = nowMs;
  store.leakyBuckets.set(key, state);

  let refillMs: number | undefined;
  if (leakRate > 0) {
    const excess = state.waterLevel - capacity;
    refillMs = excess <= 0 ? 1 : Math.max(1, Math.ceil((excess / leakRate) * 1000));
  }

  return buildDecision(config, context, false, "limit_exceeded", 0, undefined, refillMs, {
    capacity,
    refillRate: leakRate,
  });
}

function evaluateSlidingWindow(
  config: SlidingWindowConfig,
  context: LimitContext,
  store: LimitStateStore
): NormalizedLimitDecision {
  const windowMs = parseDurationMs(config.window);
  const id = context.identity || context.ip;
  const key = `${id}::${context.route}`;
  const nowMs = context.nowMs;
  const cutoff = nowMs - windowMs;
  let entry = store.slidingWindows.get(key);
  let timestamps: number[];
  if (!entry) {
    timestamps = [];
    entry = { timestamps, lastSeenMs: nowMs };
  } else {
    timestamps = entry.timestamps;
  }

  let writeIndex = 0;
  for (let readIndex = 0; readIndex < timestamps.length; readIndex += 1) {
    const timestamp = timestamps[readIndex];
    if (timestamp > cutoff) {
      timestamps[writeIndex] = timestamp;
      writeIndex += 1;
    }
  }
  timestamps.length = writeIndex;

  const allowed = timestamps.length < config.limit;
  let resetMs = 0;
  if (timestamps.length > 0) {
    resetMs = Math.max(0, timestamps[0] + windowMs - nowMs);
  }

  if (allowed) {
    timestamps.push(nowMs);
    entry.lastSeenMs = nowMs;
    store.slidingWindows.set(key, entry);
    return buildDecision(config, context, true, "within_limit", config.limit - timestamps.length, resetMs, undefined, {
      window: config.window,
      limit: config.limit,
    });
  }
  entry.lastSeenMs = nowMs;
  store.slidingWindows.set(key, entry);
  return buildDecision(config, context, false, "limit_exceeded", 0, resetMs, undefined, {
    window: config.window,
    limit: config.limit,
  });
}