import assert from "node:assert/strict";
import test from "node:test";

import { evaluateLimitDecision, type LimitStateStore } from "./decision";
import type { SlidingWindowConfig } from "../types/config";

test("multi-tenant keys isolate limiter state", () => {
  const store: LimitStateStore = {
    tokenBuckets: new Map(),
    fixedWindows: new Map(),
    slidingWindows: new Map(),
  };

  const config: SlidingWindowConfig = {
    algorithm: "sliding_window",
    limit: 1,
    window: "1m",
    key: (req: any) => req,
  };

  const now = Date.now();

  const a1 = evaluateLimitDecision(config, { route: "/", ip: "127.0.0.1", identity: "A", mode: "active", nowMs: now }, store);
  assert.equal(a1.decision, "allow");
  assert.equal(a1.timestamp, Math.floor(now / 1000));

  const a2 = evaluateLimitDecision(config, { route: "/", ip: "127.0.0.1", identity: "A", mode: "active", nowMs: now + 1 }, store);
  assert.equal(a2.decision, "block");

  const b1 = evaluateLimitDecision(config, { route: "/", ip: "127.0.0.2", identity: "B", mode: "active", nowMs: now + 2 }, store);
  assert.equal(b1.decision, "allow");
});
