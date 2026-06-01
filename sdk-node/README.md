# pace-node

Rust-powered rate limiting for Node.js. Sub-millisecond traffic control that runs in-process — no Redis, no network hop.

[![npm](https://img.shields.io/npm/v/pace-node)](https://www.npmjs.com/package/pace-node)
[![license](https://img.shields.io/badge/license-Apache%202.0-blue)](https://github.com/Subhodip-Mishra/pace-engine/blob/main/LICENSE)
## Install

```bash
npm install pace-node
```

## Quick Start

```ts
import express from "express";
import { Pace } from "pace-node";

const app = express();
const pace = new Pace({ mode: "active" });

// Protect a route
app.post("/api/generate", pace.limit({
  algorithm: "fixed_window",
  limit: 5,
  window: "1m",
}), async (req, res) => {
  res.json({ success: true });
});

app.listen(3000);
```

## Algorithms

| Algorithm | Best For |
|-----------|----------|
| `token_bucket` | Burst tolerance, smooth traffic |
| `leaky_bucket` | Smooth outbound rate, queue-style limiting |
| `sliding_window` | Precise per-user limits |
| `fixed_window` | Simple request caps |

## Modes

```ts
new Pace({ mode: "active" })    // blocks requests over limit
new Pace({ mode: "shadow" })    // logs but never blocks — safe to test
new Pace({ mode: "disabled" })  // zero overhead passthrough
```

## Custom Key

Rate limit by user ID, API key, or anything else:

```ts
app.use(pace.limit({
  algorithm: "sliding_window",
  limit: 100,
  window: "1m",
  key: (req) => req.headers["x-user-id"] ?? req.ip,
}));
```

## Express

```ts
import { Pace, paceExpress } from "pace-node";

const pace = new Pace({ mode: "active" });

// Global
app.use(paceExpress(pace, {
  algorithm: "token_bucket",
  capacity: 100,
  refillRate: 10,
}));

// Or use pace.limit() directly
app.post("/api/generate", pace.limit({
  algorithm: "fixed_window",
  limit: 10,
  window: "1m",
}), handler);
```

## Fastify

```ts
import { Pace, paceFastify } from "pace-node";

const pace = new Pace({ mode: "active" });

fastify.addHook("preHandler", paceFastify(pace, {
  algorithm: "sliding_window",
  limit: 100,
  window: "1m",
}));
```

## Next.js Middleware

```ts
// middleware.ts
import { Pace, paceNext } from "pace-node";

const pace = new Pace({ mode: "active" });

export async function middleware(req: Request) {
  const blocked = await paceNext(pace, {
    algorithm: "sliding_window",
    limit: 100,
    window: "1m",
  })(req);

  if (blocked) return blocked;
}

export const config = {
  matcher: ["/api/:path*"],
};
```

## Connect to Pace Cloud

Get analytics, dashboards, and remote rule management:

```ts
const pace = new Pace({
  mode: "active",
  apiKey: "your-api-key",
});
```

## How It Works

pace-node uses Node-API (napi-rs) to bridge JavaScript directly to a Rust engine.
Rate limiting logic runs in native machine code — no blocking, no overhead.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](https://github.com/Subhodip-Mishra/pace-engine/blob/main/LICENSE) file for more details.

© 2026 Suvodeep Mishra