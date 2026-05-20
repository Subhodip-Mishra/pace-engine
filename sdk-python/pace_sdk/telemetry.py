import threading
import time
from dataclasses import asdict, is_dataclass
from enum import Enum
from typing import List

import requests

from .types import CanonicalTelemetryEvent


class TelemetryQueue:
    def __init__(self, api_key: str, backend_url: str, enabled: bool):
        self.api_key = api_key
        self.backend_url = backend_url
        self.enabled = enabled
        self.queue: List[CanonicalTelemetryEvent] = []
        self.lock = threading.Lock()
        self.MAX_SIZE = 10000
        self.BATCH_SIZE = 500

        if enabled:
            t = threading.Thread(target=self._flush_loop, daemon=True)
            t.start()

    def push(self, event: CanonicalTelemetryEvent):
        if not self.enabled:
            return
        with self.lock:
            if len(self.queue) >= self.MAX_SIZE:
                self.queue.pop(0)
            self.queue.append(event)

    def _flush_loop(self):
        while True:
            time.sleep(2)
            self._flush()

    def _flush(self):
        with self.lock:
            if not self.queue:
                return
            batch = self.queue[: self.BATCH_SIZE]
            self.queue = self.queue[self.BATCH_SIZE :]

        def encode(value):
            if isinstance(value, Enum):
                return value.value
            if is_dataclass(value):
                return {
                    key: encode(inner)
                    for key, inner in asdict(value).items()
                    if inner is not None
                }
            if isinstance(value, list):
                return [encode(item) for item in value]
            if isinstance(value, dict):
                return {
                    key: encode(inner)
                    for key, inner in value.items()
                    if inner is not None
                }
            return value

        try:
            requests.post(
                f"{self.backend_url}/api/ingest/request",
                json={"events": [encode(event) for event in batch]},
                timeout=5,
            )
        except Exception:
            pass
