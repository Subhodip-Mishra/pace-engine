import unittest

from pace_sdk.client import Pace
from pace_sdk.types import Algorithm, PaceConfig, ProtectionMode, Thresholds, TrafficDecision


class PaceParityTests(unittest.TestCase):
    def test_sliding_window_blocks_after_limit(self):
        pace = Pace(
            PaceConfig(
                algorithm=Algorithm.SLIDING_WINDOW,
                thresholds=Thresholds(burst=1, block_duration_ms=60000),
            )
        )

        first = pace.check("127.0.0.1", "/login")
        self.assertTrue(first.allowed)
        self.assertFalse(first.would_block)

        second = pace.check("127.0.0.1", "/login")
        self.assertFalse(second.allowed)
        self.assertTrue(second.would_block)
        self.assertEqual(second.decision.decision, TrafficDecision.BLOCK)

    def test_shadow_mode_marks_would_block(self):
        pace = Pace(
            PaceConfig(
                mode=ProtectionMode.SHADOW,
                algorithm=Algorithm.SLIDING_WINDOW,
                thresholds=Thresholds(burst=1, block_duration_ms=60000),
            )
        )

        _ = pace.check("127.0.0.1", "/login")
        second = pace.check("127.0.0.1", "/login")
        self.assertTrue(second.allowed)
        self.assertTrue(second.would_block)
        self.assertEqual(second.decision.decision, TrafficDecision.WOULD_BLOCK)

    def test_identity_and_route_isolation(self):
        pace = Pace(
            PaceConfig(
                algorithm=Algorithm.TOKEN_BUCKET,
                capacity=1,
                refill_rate=0,
            )
        )

        first = pace.check_with_key("user-a", "127.0.0.1", "/login")
        self.assertTrue(first.allowed)

        second = pace.check_with_key("user-a", "127.0.0.1", "/login")
        self.assertFalse(second.allowed)

        other_route = pace.check_with_key("user-a", "127.0.0.1", "/signup")
        self.assertTrue(other_route.allowed)

        other_identity = pace.check_with_key("user-b", "127.0.0.1", "/login")
        self.assertTrue(other_identity.allowed)


if __name__ == "__main__":
    unittest.main()