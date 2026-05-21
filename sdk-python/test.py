import time
from pace_sdk.client import Pace
from pace_sdk.types import PaceConfig, ProtectionMode, Algorithm

config = PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=3,       
    refill_rate=1.0,
    debug="pretty" # Note: printing 100 times in 'pretty' mode is very slow!
)

pace = Pace(config)

print("\n--- Starting Traffic ---")

# Start the timer
start_total = time.perf_counter()

for i in range(10000):
    result = pace.check(ip="127.0.0.1", route="/generate")

# Stop the timer
end_total = time.perf_counter()

total_duration = end_total - start_total
print(f"\n✅ Processed 100 requests in {total_duration:.4f} seconds")
print(f"🚀 Average time per request: {(total_duration/10000)*1000:.4f} ms")