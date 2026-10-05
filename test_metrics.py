import json
import unittest

from app import calculate_metrics


class CalculateMetricsTests(unittest.TestCase):
    def test_pauses_fillers_and_wpm_windows(self):
        words = [
            {"word": "Hello", "start": 0.0, "end": 0.5},
            {"word": "um,", "start": 1.0, "end": 1.2},
            {"word": "I", "start": 2.0, "end": 2.2},
            {"word": "like", "start": 2.2, "end": 2.5},
            {"word": "really", "start": 30.0, "end": 30.5},
            {"word": "you", "start": 31.0, "end": 31.2},
            {"word": "know", "start": 31.2, "end": 31.5},
            {"word": "done.", "start": 64.5, "end": 65.0},
        ]
        metrics = calculate_metrics(words)

        self.assertEqual(metrics["duration_seconds"], 65.0)
        self.assertEqual([(pause["start"], pause["end"]) for pause in metrics["long_pauses"]], [(1.2, 2.0), (2.5, 30.0), (31.5, 64.5)])
        self.assertEqual(metrics["hesitation_filler_count"], 1)
        self.assertEqual(metrics["filler_word_count"], 2)
        self.assertEqual([window["word_count"] for window in metrics["wpm_windows"]], [4, 3, 1])
        self.assertEqual([window["wpm"] for window in metrics["wpm_windows"]], [8.0, 6.0, 12.0])
        self.assertEqual(metrics["overall_wpm"], 7.38)
        print("\nHand-made metrics output:")
        print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    unittest.main()