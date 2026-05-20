import pace_native
import time

BATCH_SIZE = 1_000_000
IPS = ["192.168.1.1"] * BATCH_SIZE
CAP = 1_000_000
RATE = 100_000
ORG_ID = "org_dev_123"

start = time.perf_counter()
_ = pace_native.check_batch(IPS, CAP, RATE, ORG_ID)
end = time.perf_counter()

total_seconds = end - start
ops_per_sec = int(BATCH_SIZE / total_seconds)

print("-" * 40)
print(f"Total Seconds: {total_seconds:.4f}")
print(f"Requests/Sec : {ops_per_sec:,}")
print("-" * 40)
