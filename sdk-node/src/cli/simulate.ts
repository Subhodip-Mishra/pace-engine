#!/usr/bin/env node

const args = process.argv.slice(2);

const type = args[0] || "burst";
const route = args.find((a) => a.startsWith("--route="))?.split("=")[1] || "/api/test";
const requests = Number(args.find((a) => a.startsWith("--requests="))?.split("=")[1]) || 100;
const capacity = Number(args.find((a) => a.startsWith("--capacity="))?.split("=")[1]) || 10;

// Simple JS simulation (no native engine needed for CLI)
const buckets = new Map<string, { tokens: number; last: number }>();

function checkTokenBucket(ip: string, cap: number): boolean {
  const now = Date.now();
  const b = buckets.get(ip) || { tokens: cap, last: now };
  const elapsed = (now - b.last) / 1000;
  b.tokens = Math.min(cap, b.tokens + elapsed * 10);
  b.last = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    buckets.set(ip, b);
    return true;
  }
  buckets.set(ip, b);
  return false;
}

console.log("\n🔬 Pace Simulator");
console.log("─────────────────────────────");
console.log(`Type: ${type}`);
console.log(`Route: ${route}`);
console.log(`Requests: ${requests}`);
console.log(`Capacity: ${capacity}`);
console.log("─────────────────────────────\n");

let allowed = 0;
let wouldBlock = 0;

for (let i = 0; i < requests; i++) {
  const ip = type === "distributed" ? `192.168.1.${Math.floor(Math.random() * 255)}` : "127.0.0.1";

  const ok = checkTokenBucket(ip, capacity);
  if (ok) allowed++;
  else wouldBlock++;
}

const blockRate = ((wouldBlock / requests) * 100).toFixed(1);

console.log(`✅ Allowed:     ${allowed}`);
console.log(`🚫 Would Block: ${wouldBlock}`);
console.log(`📊 Block Rate:  ${blockRate}%`);
console.log("\n💡 Recommendation:");

if (Number(blockRate) > 80) {
  console.log(`   Capacity too low for this traffic. Try --capacity=${requests}`);
} else if (Number(blockRate) === 0) {
  console.log("   Capacity is fine. No blocking needed.");
} else {
  console.log(`   ${blockRate}% of traffic would be blocked in active mode.`);
  console.log('   Run with mode:"active" to enforce this.');
}
