from dataclasses import dataclass, field
from typing import Optional, Union
from enum import Enum

class ProtectionMode(str, Enum):
    ACTIVE = "active"
    SHADOW = "shadow"
    DISABLED = "disabled"

class Algorithm(str, Enum):
    TOKEN_BUCKET = "token_bucket"
    SLIDING_WINDOW = "sliding_window"
    FIXED_WINDOW = "fixed_window"
    LEAKY_BUCKET = "leaky_bucket"

class TrafficDecision(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"
    WOULD_BLOCK = "would_block"

class DecisionReason(str, Enum):
    WITHIN_LIMIT = "within_limit"
    LIMIT_EXCEEDED = "limit_exceeded"
    TOKEN_EXHAUSTED = "token_exhausted"

# REMOVED: LogMode Enum is no longer needed!

@dataclass
class CanonicalDecision:
    decision: TrafficDecision
    reason: DecisionReason
    algorithm: Algorithm
    route: str
    key: Optional[str] = None
    remaining: Optional[int] = None
    reset_ms: Optional[int] = None
    latency_ms: Optional[int] = None
    mode: ProtectionMode = ProtectionMode.ACTIVE
    timestamp: int = 0
    ip: Optional[str] = None
    window: Optional[str] = None
    limit: Optional[int] = None
    capacity: Optional[int] = None
    refill_rate: Optional[float] = None
    refill_ms: Optional[int] = None

@dataclass
class CanonicalTelemetryRequest:
    route: str
    ip: str
    method: Optional[str] = None
    status_code: Optional[int] = None
    latency_ms: Optional[int] = None
    user_agent: Optional[str] = None
    key: Optional[str] = None
    mode: ProtectionMode = ProtectionMode.ACTIVE

@dataclass
class CanonicalTelemetryEvent:
    event_type: str
    timestamp: int
    decision: CanonicalDecision
    request: CanonicalTelemetryRequest
    api_key: Optional[str] = None
    sdk_version: Optional[str] = None

@dataclass
class Rules:
    requests_per_minute: Optional[int] = None
    requests_per_second: Optional[int] = None
    burst_limit: Optional[int] = None

@dataclass
class Thresholds:
    burst: int = 20
    block_duration_ms: int = 60000

@dataclass
class PaceConfig:
    api_key: Optional[str] = None
    mode: ProtectionMode = ProtectionMode.ACTIVE
    algorithm: Algorithm = Algorithm.TOKEN_BUCKET
    capacity: int = 100
    refill_rate: int = 10
    # Unified debug setting: False, True, "compact", or "pretty"
    debug: Union[bool, str] = False
    identity_header: Optional[str] = None
    backend_url: str = "http://localhost:4000"
    rules: Rules = field(default_factory=Rules)
    thresholds: Thresholds = field(default_factory=Thresholds)

@dataclass
class CheckResult:
    allowed: bool
    would_block: bool
    reason: Optional[str] = None
    decision: Optional[CanonicalDecision] = None