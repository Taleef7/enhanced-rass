#!/usr/bin/env python3
"""
evaluation/compare_runs.py
==========================
Regression detection: compare the latest evaluation run against the previous baseline.

Usage:
    python evaluation/compare_runs.py [options]

Options:
    --results-dir  Directory containing run JSON files (default: evaluation/results/)
    --threshold    Maximum allowed relative degradation (default: 0.05 = 5%)
    --baseline     Path to specific baseline JSON (auto-selects penultimate run if omitted)
    --current      Path to specific current run JSON (auto-selects latest run if omitted)

Exit codes:
    0   All metrics within threshold (or improved)
    1   One or more metrics degraded beyond threshold
    2   Not enough run files to compare (need at least 2)
"""

import argparse
import json
import logging
import sys
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)

TRACKED_METRICS = [
    "context_relevance",
    "answer_faithfulness",
    "answer_relevance",
    "recall_at_5",
]


def load_run(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def compare(baseline: dict, current: dict, threshold: float) -> bool:
    """
    Compare aggregate means of tracked metrics.
    Returns True if all metrics pass (no regressions beyond threshold).
    Prints a comparison table.
    """
    baseline_agg = baseline.get("aggregates", {})
    current_agg = current.get("aggregates", {})

    log.info(f"\n{'='*70}")
    log.info(f"Regression comparison")
    log.info(f"  Baseline : {baseline.get('run_id', 'unknown')} ({baseline.get('run_at', '')[:19]})")
    log.info(f"  Current  : {current.get('run_id', 'unknown')} ({current.get('run_at', '')[:19]})")
    log.info(f"  Threshold: {threshold * 100:.1f}% maximum allowed degradation")
    log.info(f"{'='*70}")
    log.info(f"{'Metric':30s}  {'Baseline':>10}  {'Current':>10}  {'Delta':>10}  {'Status':>10}")
    log.info(f"{'-'*70}")

    all_pass = True

    for metric in TRACKED_METRICS:
        base_val = baseline_agg.get(metric, {}).get("mean")
        curr_val = current_agg.get(metric, {}).get("mean")

        if base_val is None or curr_val is None:
            log.warning(f"  {metric}: missing from one or both runs — skipping")
            continue

        delta = curr_val - base_val
        # Relative degradation (only care about negative deltas)
        relative_degradation = (base_val - curr_val) / max(base_val, 1e-9) if base_val > 0 else 0

        if relative_degradation > threshold:
            status = "FAIL ✗"
            all_pass = False
        elif delta < 0:
            status = "WARN ↓"
        elif delta > 0:
            status = "PASS ↑"
        else:
            status = "PASS ="

        log.info(
            f"  {metric:30s}  {base_val:>10.4f}  {curr_val:>10.4f}  {delta:>+10.4f}  {status:>10}"
        )

    log.info(f"{'='*70}")

    # Also check latency p95 (allow up to 20% latency increase, independent of threshold)
    base_lat = baseline_agg.get("latency_ms", {}).get("p95")
    curr_lat = current_agg.get("latency_ms", {}).get("p95")
    if base_lat and curr_lat:
        lat_change = (curr_lat - base_lat) / max(base_lat, 1)
        lat_status = "WARN ↑" if lat_change > 0.20 else "OK"
        log.info(f"  {'latency_ms (p95)':30s}  {base_lat:>10.1f}  {curr_lat:>10.1f}  "
                 f"{curr_lat - base_lat:>+10.1f}  {lat_status:>10}")

    log.info(f"{'='*70}")
    return all_pass


def find_latest_runs(results_dir: Path, n: int = 2):
    """Return the n most recent run_*.json files, sorted oldest→newest."""
    run_files = sorted(results_dir.glob("run_*.json"))
    if len(run_files) < n:
        return run_files
    return run_files[-n:]


def main():
    parser = argparse.ArgumentParser(description="RASS Evaluation Regression Detector")
    parser.add_argument(
        "--results-dir",
        default=str(Path(__file__).parent / "results"),
        help="Directory containing run JSON files",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=float(os.environ.get("REGRESSION_THRESHOLD", "0.05")) if False else 0.05,
        help="Maximum allowed relative degradation (0.05 = 5%%)",
    )
    parser.add_argument("--baseline", default=None, help="Path to baseline run JSON")
    parser.add_argument("--current", default=None, help="Path to current run JSON")
    args = parser.parse_args()

    results_dir = Path(args.results_dir)

    if args.baseline and args.current:
        baseline_path = Path(args.baseline)
        current_path = Path(args.current)
    else:
        runs = find_latest_runs(results_dir, n=2)
        if len(runs) < 2:
            log.error(
                f"Need at least 2 run JSON files in {results_dir} to compare. "
                f"Found {len(runs)}. Run evaluation/run_eval.py first."
            )
            sys.exit(2)
        baseline_path = runs[-2]
        current_path = runs[-1]

    if not baseline_path.exists():
        log.error(f"Baseline not found: {baseline_path}")
        sys.exit(2)
    if not current_path.exists():
        log.error(f"Current run not found: {current_path}")
        sys.exit(2)

    baseline = load_run(baseline_path)
    current = load_run(current_path)

    log.info(f"Baseline: {baseline_path}")
    log.info(f"Current:  {current_path}")

    passed = compare(baseline, current, args.threshold)

    if passed:
        log.info("All metrics within acceptable bounds. ✓")
        sys.exit(0)
    else:
        log.error("One or more metrics degraded beyond the configured threshold. ✗")
        sys.exit(1)


import os  # noqa: E402 (needed for os.environ default in argparse)

if __name__ == "__main__":
    main()
