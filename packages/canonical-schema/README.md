# Canonical Schema

This package defines the official Pace V1 contracts for decisions and telemetry.

Use these schemas as the source of truth for:

* SDK decision normalization
* telemetry event emission
* Pace Cloud ingestion
* dashboard analytics
* replay and simulation tooling

## Files

* [decision.schema.json](decision.schema.json) - canonical rate-limit decision payload
* [telemetry.schema.json](telemetry.schema.json) - canonical request telemetry event payload

## Decision model

The canonical decision shape is normalized across all SDKs:

* `decision`: `allow`, `block`, or `would_block`
* `reason`: `within_limit`, `limit_exceeded`, or `token_exhausted`
* `algorithm`: `sliding_window`, `fixed_window`, or `token_bucket`
* `route`: request route or path
* `key`: multi-tenant identity key when available
* `remaining`: remaining budget when applicable
* `resetMs`: time until the current window resets
* `latencyMs`: request decision latency in milliseconds
* `mode`: `active` or `shadow`
* `timestamp`: Unix epoch seconds

Optional compatibility fields such as `ip`, `window`, `limit`, `capacity`, `refillRate`, and `refillMs` may be emitted by SDKs, but canonical consumers should rely on the shared core fields above.

## Telemetry model

Telemetry events wrap the canonical decision with request metadata:

* `eventType`: currently `decision`
* `timestamp`: event timestamp in Unix epoch seconds
* `decision`: canonical decision object
* `request`: route, IP, mode, method, status, latency, key, and user agent fields

Pace Cloud should ingest this format directly and treat it as the canonical analytics contract.
