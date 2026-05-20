package pace

import (
	"bytes"
	"encoding/json"
	"net/http"
	"sync"
	"time"
)

type TelemetryQueue struct {
	apiKey     string
	backendURL string
	enabled    bool
	queue      []CanonicalTelemetryEvent
	mu         sync.Mutex
}

func NewTelemetryQueue(apiKey string, backendURL string, enabled bool) *TelemetryQueue {
	t := &TelemetryQueue{
		apiKey:     apiKey,
		backendURL: backendURL,
		enabled:    enabled,
		queue:      make([]CanonicalTelemetryEvent, 0),
	}
	if enabled {
		go t.flushLoop()
	}
	return t
}

func (t *TelemetryQueue) Push(event CanonicalTelemetryEvent) {
	if !t.enabled {
		return
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if len(t.queue) >= 10000 {
		t.queue = t.queue[1:]
	}
	t.queue = append(t.queue, event)
}

func (t *TelemetryQueue) flushLoop() {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		t.flush()
	}
}

func (t *TelemetryQueue) flush() {
	t.mu.Lock()
	if len(t.queue) == 0 {
		t.mu.Unlock()
		return
	}

	count := len(t.queue)
	if count > 500 {
		count = 500
	}
	batch := make([]CanonicalTelemetryEvent, count)
	copy(batch, t.queue[:count])
	t.queue = t.queue[count:]
	t.mu.Unlock()

	payload, err := json.Marshal(map[string]any{"events": batch})
	if err != nil {
		return
	}

	_, _ = http.Post(t.backendURL+"/api/ingest/request", "application/json", bytes.NewBuffer(payload))
}
