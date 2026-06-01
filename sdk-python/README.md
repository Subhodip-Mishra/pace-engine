# pace-python

Rust-powered rate limiting for Python. Native engine via PyO3 — 
no Redis, no network hop, sub-millisecond decisions.

[![PyPI](https://img.shields.io/pypi/v/pace-python)](https://pypi.org/project/pace-python)
[![license](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)

## Install

```bash
pip install pace-python
```

## Quick Start

```python
from pace_sdk import Pace, PaceConfig, ProtectionMode, Algorithm

pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=100,
    refill_rate=10.0,
))

result = pace.check(ip="127.0.0.1", route="/api/generate")

if result.allowed:
    print("✅ Request allowed")
else:
    print(f"🚫 Blocked — reason: {result.reason}")
```

## Algorithms

| Algorithm | Config Fields |
|-----------|--------------|
| `TOKEN_BUCKET` | `capacity`, `refill_rate` |
| `LEAKY_BUCKET` | `capacity`, `refill_rate` |
| `FIXED_WINDOW` | `capacity`, `window` |
| `SLIDING_WINDOW` | `capacity`, `window` |

## Modes

```python
ProtectionMode.ACTIVE    # blocks requests over limit
ProtectionMode.SHADOW    # logs but never blocks
ProtectionMode.DISABLED  # zero overhead passthrough
```

## FastAPI

```python
from fastapi import FastAPI, Depends
from pace_sdk import Pace, PaceConfig, ProtectionMode, Algorithm

app = FastAPI()
pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.SLIDING_WINDOW,
    capacity=100,
    refill_rate=10.0,
))

@app.post("/api/generate", dependencies=[Depends(pace.middleware_fastapi())])
async def generate():
    return {"success": True}
```

## Flask

```python
from flask import Flask
from pace_sdk import Pace, PaceConfig, ProtectionMode, Algorithm

app = Flask(__name__)
pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=100,
    refill_rate=10.0,
))

app.before_request(pace.middleware_flask())

@app.route("/api/generate", methods=["POST"])
def generate():
    return {"success": True}
```

## Debug Output

```python
pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=3,
    refill_rate=1.0,
    debug="pretty"   # or "compact"
))
```

```
│ IP:        127.0.0.1
│ Algorithm: token_bucket
│ Reason:    token_exhausted
│ Mode:      active
│ Remaining: 0
│ Latency:   0ms
└────────────────────────────────────────
```

## Connect to Pace Cloud

```python
pace = Pace(PaceConfig(
    mode=ProtectionMode.ACTIVE,
    algorithm=Algorithm.TOKEN_BUCKET,
    capacity=100,
    refill_rate=10.0,
    api_key="your-api-key",
))
```

## License

Apache 2.0 © Suvodeep Mishra