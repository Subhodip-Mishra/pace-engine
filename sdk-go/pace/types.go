package pace

type ProtectionMode string

const (
	ModeActive   ProtectionMode = "active"
	ModeShadow   ProtectionMode = "shadow"
	ModeDisabled ProtectionMode = "disabled"
)

type Algorithm string

const (
	AlgorithmTokenBucket   Algorithm = "token_bucket"
	AlgorithmSlidingWindow Algorithm = "sliding_window"
	AlgorithmFixedWindow   Algorithm = "fixed_window"
	AlgorithmLeakyBucket   Algorithm = "leaky_bucket"
)

type TrafficDecision string

const (
	DecisionAllow      TrafficDecision = "allow"
	DecisionBlock      TrafficDecision = "block"
	DecisionWouldBlock TrafficDecision = "would_block"
)

type DecisionReason string

const (
	ReasonWithinLimit   DecisionReason = "within_limit"
	ReasonLimitExceeded DecisionReason = "limit_exceeded"
	ReasonTokenExhausted DecisionReason = "token_exhausted"
)

type LogMode string

const (
	LogOff     LogMode = "off"
	LogCompact LogMode = "compact"
	LogPretty  LogMode = "pretty"
)

type CanonicalDecision struct {
	Decision   TrafficDecision `json:"decision"`
	Reason     DecisionReason  `json:"reason"`
	Algorithm  Algorithm       `json:"algorithm"`
	Route      string          `json:"route"`
	Key        string          `json:"key,omitempty"`
	Remaining  int             `json:"remaining,omitempty"`
	ResetMs    int64           `json:"resetMs,omitempty"`
	LatencyMs  int64           `json:"latencyMs,omitempty"`
	Mode       ProtectionMode  `json:"mode"`
	Timestamp  int64           `json:"timestamp"`
	IP         string          `json:"ip,omitempty"`
	Window     string          `json:"window,omitempty"`
	Limit      int             `json:"limit,omitempty"`
	Capacity   int             `json:"capacity,omitempty"`
	RefillRate float64         `json:"refillRate,omitempty"`
	RefillMs   int64           `json:"refillMs,omitempty"`
}

type CanonicalTelemetryRequest struct {
	Route      string         `json:"route"`
	IP         string         `json:"ip"`
	Method     string         `json:"method,omitempty"`
	StatusCode int            `json:"statusCode,omitempty"`
	LatencyMs  int64          `json:"latencyMs,omitempty"`
	UserAgent  string         `json:"userAgent,omitempty"`
	Key        string         `json:"key,omitempty"`
	Mode       ProtectionMode `json:"mode"`
}

type CanonicalTelemetryEvent struct {
	EventType  string                   `json:"eventType"`
	Timestamp  int64                    `json:"timestamp"`
	APIKey     string                   `json:"apiKey,omitempty"`
	SDKVersion string                   `json:"sdkVersion,omitempty"`
	Decision   CanonicalDecision        `json:"decision"`
	Request    CanonicalTelemetryRequest `json:"request"`
}

type Rules struct {
	RequestsPerMinute *int
	RequestsPerSecond *int
	BurstLimit        *int
}

type Thresholds struct {
	Burst           int
	BlockDurationMS int
}

type Config struct {
	APIKey     string
	Mode       ProtectionMode
	Algorithm  Algorithm
	Capacity   int
	RefillRate int
	Debug      bool
	LogMode    string
	IdentityHeader string
	BackendURL string
	Rules      Rules
	Thresholds Thresholds
}

type CheckResult struct {
	Allowed    bool
	WouldBlock bool
	Reason     string
	Decision   CanonicalDecision
}
