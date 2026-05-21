import assert from "node:assert/strict";
import test from "node:test";

import { createPaceLogger, shouldIgnoreRoute } from "./logger";
import type { NormalizedLimitDecision } from "../types/config";
import { debug } from "node:util";

function captureStdout(run: () => void): string {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let output = "";

  (process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
    output += chunk.toString();
    return true;
  }) as unknown as (chunk: string | Uint8Array) => boolean;

  try {
    run();
  } finally {
    process.stdout.write = originalWrite;
  }

  return output;
}

const allowDecision: NormalizedLimitDecision = {
  decision: "allow",
  reason: "within_limit",
  algorithm: "sliding_window",
  route: "/",
  ip: "::1",
  mode: "active",
  timestamp: 1747500000,
  remaining: 4,
  latencyMs: 6,
};

const blockDecision: NormalizedLimitDecision = {
  decision: "block",
  reason: "limit_exceeded",
  algorithm: "sliding_window",
  route: "/login",
  ip: "::1",
  mode: "active",
  timestamp: 1747500000,
  remaining: 0,
  resetMs: 58000,
  latencyMs: 2,
};

const wouldBlockDecision: NormalizedLimitDecision = {
  decision: "would_block",
  reason: "token_exhausted",
  algorithm: "token_bucket",
  route: "/login",
  ip: "::1",
  mode: "shadow",
  timestamp: 1747500000,
  refillMs: 1000,
};

test("compact logs stay single-line and concise", () => {
  const previousNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";

  const logger = createPaceLogger("compact");
  const allowOutput = captureStdout(() => logger.logDecision(allowDecision));
  const blockOutput = captureStdout(() => logger.logDecision(blockDecision));
  const wouldBlockOutput = captureStdout(() => logger.logDecision(wouldBlockDecision));

  process.env.NO_COLOR = previousNoColor;

  assert.equal(allowOutput, "[Pace] ALLOW route=/ remaining=4 latency=6ms\n");
  assert.equal(blockOutput, "[Pace] BLOCK /login reason=limit_exceeded reset=58s latency=2ms\n");
  assert.equal(wouldBlockOutput, "[Pace] WOULD_BLOCK /login reason=token_exhausted refill=1s\n");
});

test("pretty logs emphasize allow and expand block details", () => {
  const previousNoColor = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";

  const logger = createPaceLogger("pretty");
  const allowOutput = captureStdout(() => logger.logDecision(allowDecision));
  const blockOutput = captureStdout(() => logger.logDecision(blockDecision));

  process.env.NO_COLOR = previousNoColor;

  assert.equal(allowOutput, "[Pace] ALLOWED\n\nRoute: /\nRemaining: 4\nLatency: 6ms\n");
  assert.equal(
    blockOutput,
    "[Pace] BLOCKED\n\nRoute: /login\nIP: ::1\nAlgorithm: sliding_window\nReason: limit_exceeded\nMode: active\nRemaining: 0\nReset: 58s\nLatency: 2ms\n"
  );
});

test("noisy routes stay hidden", () => {
  assert.equal(shouldIgnoreRoute("/favicon.ico"), true);
  assert.equal(shouldIgnoreRoute("/_next/static/chunks/app.js"), true);
  assert.equal(shouldIgnoreRoute("/health"), true);
  assert.equal(shouldIgnoreRoute("/login"), false);
});