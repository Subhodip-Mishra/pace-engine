from pace_sdk import Pace, PaceConfig, ProtectionMode
from pace_sdk.types import TokenBucketConfig, SlidingWindowConfig, FixedWindowConfig, LeakyBucketConfig

pace = Pace(PaceConfig(mode=ProtectionMode.ACTIVE))

# ── Direct check ──────────────────────────────
result = pace.check(
    ip="127.0.0.1",
    route="/api/generate",
    config=TokenBucketConfig(capacity=10, refill_rate=1.0),
)
if result.allowed:
    print("✅ allowed")

# ── FastAPI ───────────────────────────────────
from fastapi import FastAPI, Depends, Request

app = FastAPI()

@app.post("/api/generate", dependencies=[Depends(
    pace.limit(SlidingWindowConfig(limit=100, window="1m"))
)])
async def generate():
    return {"success": True}

# ── Flask ─────────────────────────────────────
from flask import Flask

flask_app = Flask(__name__)

@flask_app.route("/api/generate", methods=["POST"])
@pace.limit(TokenBucketConfig(capacity=10, refill_rate=1.0)).__decorator__
def generate():
    return {"success": True}

# ── Leaky bucket ─────────────────────────────
result = pace.check(
    ip="127.0.0.1",
    route="/api/upload",
    config=LeakyBucketConfig(capacity=10, refill_rate=1.0),
)
print(result.allowed)

# ── Django middleware ─────────────────────────
# settings.py
MIDDLEWARE = [
    "pace_sdk.middleware.PaceDjangoMiddleware",
]