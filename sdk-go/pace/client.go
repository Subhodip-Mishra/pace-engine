package pace

import (
	"fmt"
	"sync"
	"time"
)

const SDKVersion = "0.1.0"

type bucketState struct {
	tokens     float64
	lastRefill time.Time
	lastSeen   time.Time
}

type fixedWindowState struct {
	windowStart time.Time
	count       int
	lastSeen    time.Time
}

type slidingWindowState struct {
	timestamps []time.Time
	lastSeen   time.Time
}

type algorithmEval struct {
	allowed   bool
	reason    DecisionReason
	remaining int
	resetMs   int64
	refillMs  int64
	debugInfo string
}

type Pace struct {
	config        Config
	logMode       LogMode
	identityHeader string
	bucketsMu     sync.Mutex
	tokenBuckets  map[string]bucketState
	fixedWindows  map[string]fixedWindowState
	slidingWindows map[string]slidingWindowState
	telemetry     *TelemetryQueue
}

func New(config Config) *Pace {
	if config.Mode == "" {
		config.Mode = ModeActive
	}
	if config.Algorithm == "" {
		config.Algorithm = AlgorithmTokenBucket
	}
	if config.Capacity == 0 {
		config.Capacity = 100
	}
	if config.RefillRate == 0 {
		config.RefillRate = 10
	}
	if config.LogMode == "" && config.Debug {
		config.LogMode = string(LogCompact)
	}
	if config.BackendURL == "" {
		config.BackendURL = "http://localhost:4000"
	}
	if config.Thresholds.Burst == 0 {
		config.Thresholds.Burst = 20
	}
	if config.Thresholds.BlockDurationMS == 0 {
		config.Thresholds.BlockDurationMS = 60000
	}

	logMode := normalizeLogMode(config.LogMode, config.Debug)
	p := &Pace{
		config:         config,
		logMode:        logMode,
		identityHeader: config.IdentityHeader,
		tokenBuckets:   make(map[string]bucketState),
		fixedWindows:   make(map[string]fixedWindowState),
		slidingWindows: make(map[string]slidingWindowState),
		telemetry: NewTelemetryQueue(
			config.APIKey,
			config.BackendURL,
			config.APIKey != "",
		),
	}
	return p
}

func (p *Pace) Check(ip string, route string) CheckResult {
	return p.CheckWithKey("", ip, route)
}

func (p *Pace) CheckWithKey(identity string, ip string, route string) CheckResult {
	start := time.Now()
	if p.config.Mode == ModeDisabled {
		decision := p.buildDecision(DecisionAllow, ReasonWithinLimit, identity, ip, route, start, algorithmEval{allowed: true, reason: ReasonWithinLimit}, 200)
		return CheckResult{Allowed: true, WouldBlock: false, Reason: string(ReasonWithinLimit), Decision: decision}
	}

	eval := p.evaluate(identity, ip, route)
	wouldBlock := !eval.allowed
	allowed := eval.allowed
	if p.config.Mode == ModeShadow {
		allowed = true
	}

	decisionType := DecisionAllow
	if !allowed {
		decisionType = DecisionBlock
	}
	if p.config.Mode == ModeShadow && wouldBlock {
		decisionType = DecisionWouldBlock
	}

	decision := p.buildDecision(decisionType, eval.reason, identity, ip, route, start, eval, statusCode(allowed))
	result := CheckResult{
		Allowed:    allowed,
		WouldBlock: wouldBlock,
		Reason:     string(eval.reason),
		Decision:   decision,
	}

	logDecision(p.logMode, decision)
	p.telemetry.Push(CanonicalTelemetryEvent{
		EventType:  "decision",
		Timestamp:  decision.Timestamp,
		APIKey:     p.config.APIKey,
		SDKVersion: SDKVersion,
		Decision:   decision,
		Request: CanonicalTelemetryRequest{
			Route:      route,
			IP:         ip,
			StatusCode: statusCode(allowed),
			LatencyMs:  decision.LatencyMs,
			Mode:       p.config.Mode,
			Key:        identity,
		},
	})

	return result
}

func (p *Pace) CheckDetailed(ip string, route string) CheckResult {
	return p.CheckWithKey("", ip, route)
}


func (p *Pace) CheckDetailedWithKey(identity string, ip string, route string) CheckResult {
	return p.CheckWithKey(identity, ip, route)
}

func (p *Pace) evaluate(identity string, ip string, route string) algorithmEval {
	key := identity
	if key == "" {
		key = ip
	}
	stateKey := key + "::" + route
	now := time.Now()

	switch p.config.Algorithm {
	case AlgorithmSlidingWindow:
		return p.evaluateSlidingWindow(stateKey, now)
	case AlgorithmFixedWindow:
		return p.evaluateFixedWindow(stateKey, now)
	default:
		return p.evaluateTokenBucket(stateKey, now)
	}
}

func (p *Pace) evaluateTokenBucket(stateKey string, now time.Time) algorithmEval {
	p.bucketsMu.Lock()
	defer p.bucketsMu.Unlock()

	state, ok := p.tokenBuckets[stateKey]
	if !ok {
		state = bucketState{tokens: float64(p.config.Capacity), lastRefill: now}
	}

	elapsedSeconds := now.Sub(state.lastRefill).Seconds()
	if elapsedSeconds > 0 && p.config.RefillRate > 0 {
		state.tokens = minFloat(float64(p.config.Capacity), state.tokens+elapsedSeconds*float64(p.config.RefillRate))
	}
	state.lastRefill = now

	allowed := state.tokens >= 1
	remaining := int(state.tokens)
	var refillMs int64
	if allowed {
		state.tokens -= 1
		remaining = int(state.tokens)
		if p.config.RefillRate > 0 && state.tokens < float64(p.config.Capacity) {
			refillMs = int64(((1 - mathMod(state.tokens, 1)) / float64(p.config.RefillRate)) * 1000)
		}
		p.tokenBuckets[stateKey] = state
		return algorithmEval{allowed: true, reason: ReasonWithinLimit, remaining: remaining, refillMs: refillMs, debugInfo: fmt.Sprintf("%d tokens remaining", remaining)}
	}

	if p.config.RefillRate > 0 {
		deficit := 1 - state.tokens
		refillMs = int64((deficit / float64(p.config.RefillRate)) * 1000)
	}
	p.tokenBuckets[stateKey] = state
	return algorithmEval{allowed: false, reason: ReasonTokenExhausted, remaining: remaining, refillMs: refillMs, debugInfo: fmt.Sprintf("%d tokens remaining", remaining)}
}

func (p *Pace) evaluateFixedWindow(stateKey string, now time.Time) algorithmEval {
	p.bucketsMu.Lock()
	defer p.bucketsMu.Unlock()

	state, ok := p.fixedWindows[stateKey]
	windowMs := time.Duration(p.config.Thresholds.BlockDurationMS) * time.Millisecond
	limit := p.config.Thresholds.Burst
	if !ok {
		state = fixedWindowState{windowStart: now}
	}
	if now.Sub(state.windowStart) >= windowMs {
		state = fixedWindowState{windowStart: now}
	}
	resetMs := windowMs.Milliseconds() - now.Sub(state.windowStart).Milliseconds()
	if resetMs < 0 {
		resetMs = 0
	}

	allowed := state.count < limit
	remaining := 0
	if allowed {
		state.count++
		remaining = limit - state.count
		p.fixedWindows[stateKey] = state
		return algorithmEval{allowed: true, reason: ReasonWithinLimit, remaining: remaining, resetMs: resetMs, debugInfo: fmt.Sprintf("%d requests remaining", remaining)}
	}

	p.fixedWindows[stateKey] = state
	return algorithmEval{allowed: false, reason: ReasonLimitExceeded, remaining: 0, resetMs: resetMs, debugInfo: "0 requests remaining"}
}

func (p *Pace) evaluateSlidingWindow(stateKey string, now time.Time) algorithmEval {
	p.bucketsMu.Lock()
	defer p.bucketsMu.Unlock()

	state, ok := p.slidingWindows[stateKey]
	if !ok {
		state = slidingWindowState{timestamps: make([]time.Time, 0)}
	}
	windowMs := time.Duration(p.config.Thresholds.BlockDurationMS) * time.Millisecond
	limit := p.config.Thresholds.Burst
	windowStart := now.Add(-windowMs)
	filtered := make([]time.Time, 0, len(state.timestamps))
	for _, timestamp := range state.timestamps {
		if timestamp.After(windowStart) {
			filtered = append(filtered, timestamp)
		}
	}
	state.timestamps = filtered

	remaining := limit - len(state.timestamps)
	resetMs := int64(0)
	if len(state.timestamps) > 0 {
		resetMs = state.timestamps[0].Add(windowMs).Sub(now).Milliseconds()
		if resetMs < 0 {
			resetMs = 0
		}
	}

	allowed := len(state.timestamps) < limit
	if allowed {
		state.timestamps = append(state.timestamps, now)
		remaining = limit - len(state.timestamps)
		p.slidingWindows[stateKey] = state
		return algorithmEval{allowed: true, reason: ReasonWithinLimit, remaining: remaining, resetMs: resetMs, debugInfo: fmt.Sprintf("%d requests remaining", remaining)}
	}

	p.slidingWindows[stateKey] = state
	return algorithmEval{allowed: false, reason: ReasonLimitExceeded, remaining: 0, resetMs: resetMs, debugInfo: "0 requests remaining"}
}

func (p *Pace) buildDecision(decision TrafficDecision, reason DecisionReason, identity string, ip string, route string, start time.Time, eval algorithmEval, statusCode int) CanonicalDecision {
	now := time.Now()
	latencyMs := now.Sub(start).Milliseconds()
	key := identity
	if key == "" {
		key = ip
	}
	return CanonicalDecision{
		Decision:   decision,
		Reason:     reason,
		Algorithm:  p.config.Algorithm,
		Route:      route,
		Key:        key,
		Remaining:  eval.remaining,
		ResetMs:    eval.resetMs,
		LatencyMs:  latencyMs,
		Mode:       p.config.Mode,
		Timestamp:  now.Unix(),
		IP:         ip,
		Limit:      p.config.Capacity,
		Capacity:   p.config.Capacity,
		RefillRate: float64(p.config.RefillRate),
		RefillMs:   eval.refillMs,
	}
}

func statusCode(allowed bool) int {
	if allowed {
		return 200
	}
	return 429
}

func minFloat(a float64, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func mathMod(a float64, b float64) float64 {
	if b == 0 {
		return 0
	}
	return a - float64(int(a/b))*b
}
