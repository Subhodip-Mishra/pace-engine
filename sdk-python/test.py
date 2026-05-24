import time
from pace_sdk import Pace, PaceConfig, ProtectionMode, Algorithm

# Initialize the core engine
pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=3,       
    refill_rate=1.0,
    debug="pretty" # Beautiful CLI observability out-of-the-box
))

print("🚀 Starting high-throughput engine test...")
start = time.perf_counter()

# Test throughput with rich terminal logging
for _ in range(100):
    pace.check()  # Simulate 100 rapid requests to test the engine's performance and logging

duration = time.perf_counter() - start
print(f"✅ Processed 100 requests in {duration:.4f} seconds")
print(f"🚀 Average time per request: {(duration / 100) * 1000:.4f} ms")


"""
EXPECTED TERMINAL OUTPUT:

│ IP:        127.0.0.1
│ Algorithm: token_bucket
│ Reason:    token_exhausted
│ Mode:      active
│ Remaining: 0
│ Latency:   0ms
└────────────────────────────────────────

✅ Processed 100 requests in 0.5778 seconds
🚀 Average time per request: 0.0578 ms
"""