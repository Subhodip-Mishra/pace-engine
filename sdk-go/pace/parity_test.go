package pace

import "testing"

func TestSlidingWindowBlocksAfterLimit(t *testing.T) {
	pace := New(Config{
		Algorithm:  AlgorithmSlidingWindow,
		Thresholds:  Thresholds{Burst: 1, BlockDurationMS: 60000},
	})

	first := pace.Check("127.0.0.1", "/login")
	if !first.Allowed || first.WouldBlock {
		t.Fatalf("expected first request to be allowed, got %+v", first)
	}

	second := pace.Check("127.0.0.1", "/login")
	if second.Allowed || !second.WouldBlock {
		t.Fatalf("expected second request to be blocked, got %+v", second)
	}
	if second.Decision.Decision != DecisionBlock {
		t.Fatalf("expected canonical block decision, got %+v", second.Decision)
	}
}

func TestShadowModeWouldBlockKeepsTrafficAllowed(t *testing.T) {
	pace := New(Config{
		Mode:       ModeShadow,
		Algorithm:  AlgorithmSlidingWindow,
		Thresholds: Thresholds{Burst: 1, BlockDurationMS: 60000},
	})

	_ = pace.Check("127.0.0.1", "/login")
	second := pace.Check("127.0.0.1", "/login")
	if !second.Allowed || !second.WouldBlock {
		t.Fatalf("expected shadow mode to allow but mark would_block, got %+v", second)
	}
	if second.Decision.Decision != DecisionWouldBlock {
		t.Fatalf("expected would_block canonical decision, got %+v", second.Decision)
	}
}

func TestIdentityAndRouteIsolation(t *testing.T) {
	pace := New(Config{Algorithm: AlgorithmTokenBucket, Capacity: 1, RefillRate: 0})

	first := pace.CheckWithKey("user-a", "127.0.0.1", "/login")
	if !first.Allowed {
		t.Fatalf("expected first identity to be allowed, got %+v", first)
	}

	second := pace.CheckWithKey("user-a", "127.0.0.1", "/login")
	if second.Allowed {
		t.Fatalf("expected same identity + route to be limited, got %+v", second)
	}

	otherRoute := pace.CheckWithKey("user-a", "127.0.0.1", "/signup")
	if !otherRoute.Allowed {
		t.Fatalf("expected different route to have separate state, got %+v", otherRoute)
	}

	otherIdentity := pace.CheckWithKey("user-b", "127.0.0.1", "/login")
	if !otherIdentity.Allowed {
		t.Fatalf("expected different identity to have separate state, got %+v", otherIdentity)
	}
}