# RASS Evaluation — Quality Tracking and Regression Gates

This directory contains the evaluation harness, test sets, results, and baseline for the RASS retrieval quality discipline.

## Overview

The evaluation system provides:
1. **Automated quality measurement** — scores retrieval and generation quality on a curated test set
2. **CI regression gate** — blocks PRs that degrade quality beyond acceptable thresholds
3. **Historical tracking** — stores run results for trend analysis
4. **Grafana integration** — visualizes quality trends over time

## Directory Structure

```
evaluation/
├── BASELINE.json          # Committed quality baseline with regression thresholds
├── README.md              # This file
├── compare_runs.py        # Regression detection script
├── run_eval.py            # Evaluation runner
├── datasets/
│   └── test_set.json      # Curated test cases (ground truth Q&A pairs)
├── results/               # Stored run JSON files (committed to git)
│   ├── run_<timestamp>.json
│   └── ...
├── source_documents/      # PDF/text files used as the knowledge base for evaluation
└── trulens_evaluator/     # Optional TruLens-based deep evaluation
```

## Test Set Format

`evaluation/datasets/test_set.json` contains an array of test case objects:

```json
[
  {
    "id": "q001",
    "query": "What are the main themes of the War of the Worlds?",
    "expected_keywords": ["Martians", "invasion", "tripods", "humanity"],
    "min_keyword_matches": 2,
    "notes": "Should retrieve Chapter 1 context"
  }
]
```

### Test Case Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier (e.g., `q001`) |
| `query` | Yes | The natural language question |
| `expected_keywords` | Yes | Keywords that should appear in the retrieved context or answer |
| `min_keyword_matches` | No | Minimum keyword hits for `recall_at_5=1.0` (default: 1) |
| `notes` | No | Human-readable annotation |

## Adding New Test Cases

1. Open `evaluation/datasets/test_set.json`
2. Add a new object following the format above
3. Assign a sequential `id` (e.g., next after the last one)
4. Include at least 2 `expected_keywords` that are specific to the expected answer
5. Run `python evaluation/run_eval.py --max-queries 5` locally to verify your new case works

**Guidelines:**
- Add **at least 2 test cases** for every new retrieval feature or pipeline change
- Test cases should cover a variety of query types (factual, summarization, keyword search)
- Avoid overly narrow queries that only work with one specific document chunk
- New test cases are automatically included in the next CI eval run

## Running Evaluations

### Quick local run (5 questions, fast)

```bash
python evaluation/run_eval.py \
  --url http://localhost:8000 \
  --max-queries 5 \
  --verbose
```

### Full evaluation suite

```bash
python evaluation/run_eval.py \
  --url http://localhost:8000 \
  --test-set evaluation/datasets/test_set.json \
  --output evaluation/results/run_$(date +%Y%m%dT%H%M%SZ).json \
  --top-k 5
```

### Compare against baseline

```bash
# Compare latest two runs
python evaluation/compare_runs.py --results-dir evaluation/results

# Compare against the committed baseline
python evaluation/compare_runs.py \
  --baseline evaluation/BASELINE.json \
  --current evaluation/results/run_<timestamp>.json
```

## Baseline (`BASELINE.json`)

The baseline captures the quality metrics at a reference point in time. It contains:

```json
{
  "version": "1.0",
  "measured_at": "...",
  "metrics": {
    "context_relevance_mean": 0.70,
    "answer_faithfulness_mean": 0.72,
    "answer_relevance_mean": 0.65,
    "recall_at_5_mean": 0.72,
    "latency_p95_ms": 4200
  },
  "regression_thresholds_pct": {
    "context_relevance": 5,
    "answer_faithfulness": 5,
    "answer_relevance": 5,
    "recall_at_5": 5,
    "latency_p95": 20
  }
}
```

### Updating the Baseline

After a confirmed improvement (e.g., enabling Cohere reranking), update the baseline:

```bash
# Run the full evaluation and capture results
python evaluation/run_eval.py \
  --output evaluation/results/run_$(date +%Y%m%dT%H%M%SZ).json

# Edit BASELINE.json to reflect the new numbers and commit
git add evaluation/BASELINE.json evaluation/results/
git commit -m "eval: update baseline after enabling Cohere reranking (context_relevance +8%)"
```

## CI Regression Gate

The `.github/workflows/eval-regression-gate.yml` workflow runs on every PR to `main` that touches retrieval, ingestion, generation, or evaluation code.

- Runs a **lightweight 5-question subset** for speed (< 10 min)
- Compares results against `evaluation/BASELINE.json`
- Posts a summary comment on the PR
- **Fails the PR check** if any metric degrades beyond the threshold

## Metrics Explained

| Metric | Range | Description |
|--------|-------|-------------|
| `context_relevance` | 0–1 | How relevant the retrieved chunks are to the query |
| `answer_faithfulness` | 0–1 | How well the generated answer is grounded in the retrieved context |
| `answer_relevance` | 0–1 | How relevant the answer is to the original question |
| `recall_at_5` | 0 or 1 | Whether expected keywords appear in the top-5 retrieved documents |
| `latency_ms` | ms | Wall-clock time from query submission to answer completion |
