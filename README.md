# Pace Engine 🚀

Ultra-low latency, Rust-powered rate-limiting engine designed for high-scale backends. Built with zero-cost abstractions, thread-safety, and built-in protection against IP spoofing.

[![GitHub Build Status](https://img.shields.io/github/actions/workflow/status/Subhodip-Mishra/pace-engine/ci.yml?style=flat-square)](https://img.shields.io/github/actions/workflow/status/Subhodip-Mishra/pace-engine/ci.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg?style=flat-square)](LICENSE)
[![NPM Version](https://img.shields.io/badge/npm-v1.0.6-red?style=flat-square)](https://www.npmjs.com/package/pace-node)
[![PyPI Version](https://img.shields.io/badge/pypi-v1.0.6-blue?style=flat-square)](https://pypi.org/project/pace-python/)

---

## ⚡ Why Pace?

- **Blazing Fast:** Evaluates over **1,000,000+ requests in under 1.6 seconds** (~635k req/sec) on a single thread.
- **Memory Safe & Concurrent:** Powered by Rust's memory safety guarantees and high-concurrency data structures (`DashMap`).
- **4 Native Algorithms:** Flexible rate-limiting algorithms built directly into the engine:
  - 📥 **Token Bucket:** Perfect for allowing micro-bursts while keeping an average rate.
  - 🚰 **Leaky Bucket:** Ensures smooth traffic flows by leaking requests at a constant speed.
  - 🪟 **Fixed Window:** Simple, memory-efficient interval blocking.
  - 🔍 **Sliding Window:** High-precision interval rate limiting without boundary resets.
- **Spoof-Proof:** Native, secure client-IP extraction order protecting against HTTP header rotation attacks.
- **Atomic Bursts:** Clean token regeneration math with zero mathematical drift under microsecond concurrent bursts.

---

## 📊 Performance Benchmarks

All benchmarks are verified using Jest and executed on real-time hardware.

| Scenario | Total Requests | Allowed | Blocked | Execution Time | Latency / Request |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Microsecond Burst** | 5,000 | 100 | 4,900 | **18 ms** | ~0.003 ms |
| **Noisy Neighbor (Botnet)** | 100,000 | 100,000 | 0 | **286 ms** | ~0.002 ms |
| **High-Scale Load** | 1,000,000 | 100 | 999,900 | **1.57 s** | ~0.001 ms |

---

## 🛡️ Spoof-Proof IP Extraction (New in v1.0.6)

Pace protects your backend from rate-limit bypasses by ignoring easily-spoofable client-side headers. The IP is resolved using a strict priority chain:

1. **Cloudflare:** `CF-Connecting-IP` (Cryptographically verified proxy IP)
2. **Vercel / Nginx Real IP:** `X-Real-IP` (Overwritten by trusted edge router)
3. **X-Forwarded-For:** `X-Forwarded-For` (Only fallback if trust proxy is configured)
4. **Socket Remote Address:** `req.socket.remoteAddress` (Standard localhost / raw TCP socket fallback)

---

## 📦 Installation

### Node.js (NPM)
```bash
npm install pace-node
```

### Python (PIP)
```bash
pip install pace-python
```

---

## 🚀 Quick Start (Node.js)

### Core SDK Usage

```javascript
const { PaceNode } = require("pace-node");

const pace = new PaceNode({
  algorithm: "token_bucket",
  mode: "active",
  capacity: 100,
  refillRate: 10 // Refill 10 tokens per second
});

// Check a request
const decision = pace.checkRequest("127.0.0.1", "/api/v1/resource", Date.now());

if (decision.allowed) {
  console.log("Allow request:", decision.debugInfo); // e.g. "99 tokens remaining"
} else {
  console.log("Block request"); // 429 Too Many Requests
}
```

### Express.js Middleware Integration

```javascript
const express = require('express');
const { PaceNode } = require('pace-node');
const { paceExpress } = require('pace-node/frameworks/express');

const app = express();

const pace = new PaceNode({
  algorithm: "token_bucket",
  mode: "active",
  capacity: 60,
  refillRate: 1
});

// Protect routes globally or individually
app.use(paceExpress(pace, {
  algorithm: "token_bucket",
  limit: 60,
  window: "60s"
}));
```

### Next.js Middleware Integration

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PaceNode } from 'pace-node';
import { paceNext } from 'pace-node/frameworks/nextjs';

const pace = new PaceNode({
  algorithm: "token_bucket",
  mode: "active",
  capacity: 100,
  refillRate: 10
});

const rateLimiter = paceNext(pace, {
  algorithm: "token_bucket",
  limit: 100,
  window: "60s"
});

export async function middleware(request: NextRequest) {
  const result = await rateLimiter(request);
  if (result) return result; // Returns a 429 Response if blocked
  
  return NextResponse.next();
}
```

---

## 🚀 Quick Start (Python)

### Core SDK Usage

```python
from pace_sdk import Pace, PaceConfig, ProtectionMode
from pace_sdk.types import TokenBucketConfig

# Initialize the SDK
pace = Pace(PaceConfig(mode=ProtectionMode.ACTIVE))

# Check request status
result = pace.check(
    ip="127.0.0.1",
    route="/api/generate",
    config=TokenBucketConfig(capacity=10, refill_rate=1.0),
)

if result.allowed:
    print("Request allowed:", result.debug_info)
else:
    print("Request blocked (429 Too Many Requests)")
```

### FastAPI Integration

```python
from fastapi import FastAPI, Depends
from pace_sdk import Pace, PaceConfig, ProtectionMode
from pace_sdk.types import SlidingWindowConfig

app = FastAPI()
pace = Pace(PaceConfig(mode=ProtectionMode.ACTIVE))

@app.post("/api/generate", dependencies=[Depends(
    pace.limit(SlidingWindowConfig(limit=100, window="1m"))
)])
async def generate():
    return {"success": True}
```

### Flask Integration

```python
from flask import Flask
from pace_sdk import Pace, PaceConfig, ProtectionMode
from pace_sdk.types import TokenBucketConfig

app = Flask(__name__)
pace = Pace(PaceConfig(mode=ProtectionMode.ACTIVE))

@app.route("/api/generate", methods=["POST"])
@pace.limit(TokenBucketConfig(capacity=10, refill_rate=1.0)).__decorator__
def generate():
    return {"success": True}
```

---

## 📄 License

Pace is licensed under the **Apache 2.0 License**. See [LICENSE](LICENSE) for more details.
