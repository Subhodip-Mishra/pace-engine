import type { DebugMode, NormalizedLimitDecision, TrafficDecision } from "../types/config";
import { isNoisyRoute } from "./decision";

export type LogMode = "off" | "compact" | "pretty";

export function normalizeDebugMode(debug?: DebugMode): LogMode {
  if (debug === "pretty") return "pretty";
  if (debug === true || debug === "compact") return "compact";
  return "off";
}

const ANSI = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  dim: "\x1b[2m",
} as const;

const HEADLINE_COMPACT: Record<TrafficDecision, string> = {
  allow: "ALLOW",
  block: "BLOCK",
  would_block: "WOULD_BLOCK",
};

const HEADLINE_PRETTY: Record<TrafficDecision, string> = {
  allow: "ALLOWED",
  block: "BLOCKED",
  would_block: "WOULD_BLOCK",
};

const COLOR_BY_DECISION: Record<TrafficDecision, keyof typeof ANSI> = {
  allow: "green",
  block: "red",
  would_block: "yellow",
};

export interface PaceLoggerOptions {
  debug?: DebugMode;
}

export interface PaceLogger {
  enabled: boolean;
  format: "compact" | "pretty";
  color: boolean;
  logDecision: (decision: NormalizedLimitDecision) => void;
}

export function resolveLoggerOptions(debug?: DebugMode): PaceLoggerOptions & { enabled: boolean; format: "compact" | "pretty" } {
  if (debug === "pretty") {
    return { enabled: true, format: "pretty", debug };
  }

  if (debug === "compact" || debug === true) {
    return { enabled: true, format: "compact", debug };
  }

  return { enabled: false, format: "compact", debug };
}

export function supportsColor(stream: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(stream.isTTY && process.env.NO_COLOR !== "1" && process.env.TERM !== "dumb");
}

export function shouldIgnoreRoute(route: string): boolean {
  return isNoisyRoute(route);
}

export function formatDurationMs(ms: number): string {
  if (ms <= 0) return "0ms";
  if (ms % 3600000 === 0) return `${ms / 3600000}h`;
  if (ms % 60000 === 0) return `${ms / 60000}m`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}

function formatOptionalDuration(ms?: number): string | undefined {
  if (ms === undefined || ms <= 0) {
    return undefined;
  }

  return formatDurationMs(ms);
}

export function createPaceLogger(mode: LogMode): PaceLogger {
  const resolved = resolveLoggerOptions(mode === "pretty" ? "pretty" : mode === "compact" ? "compact" : false);
  const color = mode !== "off" && supportsColor();

  return {
    enabled: resolved.enabled,
    format: resolved.format,
    color,
    logDecision(decision: NormalizedLimitDecision) {
      if (!resolved.enabled || shouldIgnoreRoute(decision.route)) {
        return;
      }

      const compactHeadline = HEADLINE_COMPACT[decision.decision];
      const prettyHeadline = HEADLINE_PRETTY[decision.decision];
      const compactColoredHeadline = color
        ? `${ANSI[COLOR_BY_DECISION[decision.decision]]}${compactHeadline}${ANSI.reset}`
        : compactHeadline;
      const prettyColoredHeadline = color
        ? `${ANSI[COLOR_BY_DECISION[decision.decision]]}${prettyHeadline}${ANSI.reset}`
        : prettyHeadline;

      if (resolved.format === "compact") {
        const parts: string[] = [`[Pace] ${compactColoredHeadline}`];

        if (decision.decision === "allow") {
          parts.push(`route=${decision.route}`);
          if (decision.remaining !== undefined) parts.push(`remaining=${decision.remaining}`);
          if (decision.latencyMs !== undefined) parts.push(`latency=${decision.latencyMs}ms`);
        } else if (decision.decision === "would_block") {
          parts.push(decision.route);
          parts.push(`reason=${decision.reason}`);
          const refill = formatOptionalDuration(decision.refillMs);
          if (refill) parts.push(`refill=${refill}`);
        } else {
          parts.push(decision.route);
          parts.push(`reason=${decision.reason}`);
          const reset = formatOptionalDuration(decision.resetMs);
          if (reset) parts.push(`reset=${reset}`);
          const refill = formatOptionalDuration(decision.refillMs);
          if (refill) parts.push(`refill=${refill}`);
          if (decision.latencyMs !== undefined) parts.push(`latency=${decision.latencyMs}ms`);
        }

        process.stdout.write(`${parts.join(" ")}\n`);
        return;
      }

      const lines: string[] = [`[Pace] ${prettyColoredHeadline}`];

      if (decision.decision === "allow") {
        lines.push("", `Route: ${decision.route}`);
        if (decision.remaining !== undefined) lines.push(`Remaining: ${decision.remaining}`);
        if (decision.latencyMs !== undefined) lines.push(`Latency: ${decision.latencyMs}ms`);
      } else if (decision.decision === "would_block") {
        lines.push(
          "",
          `Route: ${decision.route}`,
          `Reason: ${decision.reason}`,
          `Mode: ${decision.mode}`
        );
        const refill = formatOptionalDuration(decision.refillMs);
        if (refill) lines.push(`Refill: ${refill}`);
      } else {
        lines.push(
          "",
          `Route: ${decision.route}`,
          `IP: ${decision.ip}`,
          `Algorithm: ${decision.algorithm}`,
          `Reason: ${decision.reason}`,
          `Mode: ${decision.mode}`
        );
        if (decision.remaining !== undefined) lines.push(`Remaining: ${decision.remaining}`);
        const reset = formatOptionalDuration(decision.resetMs);
        if (reset) lines.push(`Reset: ${reset}`);
        const refill = formatOptionalDuration(decision.refillMs);
        if (refill) lines.push(`Refill: ${refill}`);
        if (decision.latencyMs !== undefined) lines.push(`Latency: ${decision.latencyMs}ms`);
      }

      process.stdout.write(`${lines.join("\n")}\n`);
    },
  };
}

export function writeBootstrapLog(message: string) {
  process.stderr.write(`${message}\n`);
}