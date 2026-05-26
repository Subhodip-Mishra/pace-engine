# Pace Python SDK

Pace is a Rust-powered Python SDK for rate limiting, request protection, and lightweight traffic control. It exposes a small Python API backed by the native engine in `pace_sdk.pace_native`, so you can apply protection logic with minimal overhead.

The SDK is designed for two common use cases:

1. Direct checks in application code.
2. Framework integration for FastAPI and Django.

## Features

- Native Rust execution for the core rate-limiting logic.
- Multiple algorithms: token bucket, sliding window, fixed window, and leaky bucket.
- Protection modes for active enforcement, shadow evaluation, and disablement.
- Structured results via Python dataclasses.
- Optional helpers for FastAPI and Django.
- Debug logging with compact or pretty output.

## Installation

Install the package from PyPI:

```bash
pip install pace-python
```

Optional framework extras:

```bash
pip install "pace-python[fastapi]"
pip install "pace-python[flask]"
```

## Quick Start

The main entrypoint is `pace_sdk.Pace`.

```python
from pace_sdk import Algorithm, Pace, PaceConfig, ProtectionMode

pace = Pace(
    PaceConfig(
        mode=ProtectionMode.ACTIVE,
        algorithm=Algorithm.TOKEN_BUCKET,
        capacity=100,
        refill_rate=10,
        debug="compact",
    )
)

result = pace.check(ip="203.0.113.10", route="/api/login")

if result.allowed:
    print("Request permitted")
else:
    print(f"Blocked: {result.reason}")
```

## How It Works

At a high level, Pace follows this flow:

1. You create a `PaceConfig` describing algorithm, capacity, refill rate, mode, and debug behavior.
2. `Pace` converts that configuration into a Rust-native engine instance.
3. Each call to `check(...)` delegates to the native engine.
4. The Rust result is normalized into a Python `CheckResult` object.
5. Logging is emitted when debug mode is enabled.

This keeps the Python surface small while moving the heavy lifting into Rust.

## Public API

Import the public symbols from `pace_sdk`:

```python
from pace_sdk import (
    Algorithm,
    Pace,
    PaceConfig,
    PaceFastAPI,
    ProtectionMode,
    pace_django,
)
```

### `Pace`

Create the engine with `Pace(config: PaceConfig)`.

Methods:

- `check(ip, route="/", key=None)`
- `check_detailed(ip, route="/", key=None)`
- `check_with_key(key, ip, route="/")`

Notes:

- `check_detailed(...)` is currently an alias for `check(...)`.
- `check_with_key(...)` is a convenience wrapper for multi-tenant or user-scoped throttling.

### `CheckResult`

`check(...)` returns a `CheckResult` dataclass with these fields:

- `allowed`: final allow/block decision.
- `would_block`: whether the request would be blocked in non-enforcing modes.
- `reason`: short string reason from the engine.
- `decision`: structured `CanonicalDecision` data.

### `PaceConfig`

`PaceConfig` controls the engine behavior.

| Field | Type | Default | Purpose |
| --- | --- | --- | --- |
| `api_key` | `str | None` | `None` | API key used for backend and telemetry integrations. |
| `mode` | `ProtectionMode` | `ACTIVE` | Enforcement mode. |
| `algorithm` | `Algorithm` | `TOKEN_BUCKET` | Rate-limiting algorithm. |
| `capacity` | `int` | `100` | Burst capacity or token pool size. |
| `refill_rate` | `int` | `10` | Refill rate for token-based algorithms. |
| `debug` | `bool | str` | `False` | Debug logging mode. Accepts `True`, `False`, `"compact"`, or `"pretty"`. |
| `identity_header` | `str | None` | `None` | Optional request header for identity-based limiting. |
| `backend_url` | `str` | `"http://localhost:4000"` | Backend endpoint for telemetry and ingestion. |
| `rules` | `Rules` | default factory | Rule configuration container. |
| `thresholds` | `Thresholds` | default factory | Threshold and block-duration configuration. |

### Enums

- `ProtectionMode`: `ACTIVE`, `SHADOW`, `DISABLED`
- `Algorithm`: `TOKEN_BUCKET`, `SLIDING_WINDOW`, `FIXED_WINDOW`, `LEAKY_BUCKET`
- `TrafficDecision`: `ALLOW`, `BLOCK`, `WOULD_BLOCK`
- `DecisionReason`: `WITHIN_LIMIT`, `LIMIT_EXCEEDED`, `TOKEN_EXHAUSTED`

## Framework Integrations

### FastAPI

Use `PaceFastAPI` to create a dependency that protects a route:

```python
from fastapi import FastAPI
from pace_sdk import Algorithm, Pace, PaceConfig, PaceFastAPI

app = FastAPI()
pace = Pace(PaceConfig(algorithm=Algorithm.SLIDING_WINDOW, capacity=50, refill_rate=5))
rate_limit = PaceFastAPI(pace)


@app.get("/login")
def login(_: None = rate_limit.limit("/login")):
    return {"ok": True}
```

For middleware-style integration, the package also includes `FastAPIMiddleware` in `pace_sdk.middleware`.

### Django

Wrap a Django view with `pace_django(...)`:

```python
from pace_sdk import Pace, PaceConfig, pace_django

pace = Pace(PaceConfig())


@pace_django(pace, route="/login")
def login_view(request):
    ...
```

### Flask

The middleware module also exposes `flask_middleware(...)` for Flask decorators:

```python
from pace_sdk.middleware import flask_middleware

protected_view = flask_middleware(pace)(view_func)
```

## Logging and Debugging

Set `debug` on `PaceConfig` to control console output:

- `False`: no decision logging.
- `True`: compact logging.
- `"compact"`: compact logging.
- `"pretty"`: multi-line, human-readable logging.

The runtime also respects the `PACE_DEBUG=true` environment variable and prints a native-engine load message.

## Result Structure

The `decision` field on `CheckResult` contains structured metadata such as:

- `decision`
- `reason`
- `algorithm`
- `route`
- `ip`
- `key`
- `remaining`
- `latency_ms`
- `mode`

This is useful when you want to inspect enforcement behavior without parsing logs.

## Common Usage Patterns

### Route-specific throttling

Call `check(ip, route="/path")` for path-aware protection.

### User-scoped throttling

Call `check_with_key("user-id", ip, route)` to group requests by account or session.

### Shadow mode rollout

Use `ProtectionMode.SHADOW` when you want to observe what would be blocked before enforcing it.

### Identity headers

Set `identity_header` in `PaceConfig` when your framework integration should read a user or tenant key from headers.

## Example

```python
from pace_sdk import Algorithm, Pace, PaceConfig, ProtectionMode

pace = Pace(
    PaceConfig(
        mode=ProtectionMode.SHADOW,
        algorithm=Algorithm.FIXED_WINDOW,
        capacity=20,
        refill_rate=5,
        debug="pretty",
    )
)

result = pace.check("127.0.0.1", "/api/payments", key="tenant-42")

print(result.allowed)
print(result.would_block)
print(result.decision.reason)
```

## Project Layout

- `pace_sdk/client.py`: main `Pace` engine wrapper.
- `pace_sdk/core.py`: thread-safe engine variant.
- `pace_sdk/types.py`: enums, configuration objects, and result dataclasses.
- `pace_sdk/helpers.py`: FastAPI and Django helpers.
- `pace_sdk/middleware.py`: Flask and FastAPI middleware adapters.
- `pace_sdk/telemetry.py`: queued telemetry delivery.
- `pace_sdk/logger.py`: debug formatting and decision logging.

## Notes

- The package name on PyPI is `pace-python`.
- The import namespace used by the SDK is `pace_sdk`.
- The native module is built by Maturin and loaded as `pace_sdk.pace_native`.

## License

This project is licensed under the Apache License, Version 2.0. See the [LICENSE](../LICENSE) file for more details.