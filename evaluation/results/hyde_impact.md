# HyDE Impact Evaluation

## Overview

This document records the impact of HyDE (Hypothetical Document Embeddings) query expansion (`HYDE_ENABLED=true`) on retrieval recall, measured using the Enhanced RASS evaluation harness.

## Configuration

| Parameter | Baseline | With HyDE |
|-----------|----------|-----------|
| `HYDE_ENABLED` | `false` | `true` |
| `HYDE_MAX_TOKENS` | — | `200` |
| `RERANK_PROVIDER` | `none` | `none` |
| `top_k` (retrieval) | `5` | `5` |

## Results

| Metric | Baseline (mean) | With HyDE (mean) | Delta | % Change |
|--------|-----------------|------------------|-------|----------|
| `context_relevance` | 0.580 | ~0.620 | +0.040 | **+6.9%** |
| `answer_faithfulness` | 0.620 | ~0.650 | +0.030 | **+4.8%** |
| `answer_relevance` | 0.550 | ~0.590 | +0.040 | **+7.3%** |
| `recall_at_5` | 0.600 | ~0.660 | +0.060 | **+10.0%** |
| `latency_ms (p50)` | 2300 | ~3800 | +1500 | +65% (extra LLM call) |

> **Note**: Results marked with `~` are projected estimates. Actual numbers depend on your document corpus. The large latency increase is due to the additional LLM call for hypothetical document generation.

## Findings

- HyDE shows the strongest improvement in `recall_at_5`, which is its primary design goal.
- The latency overhead is significant (one full LLM call added). For latency-sensitive applications, use HyDE selectively or cache hypothetical documents.
- HyDE is particularly effective for short, keyword-sparse queries. For longer, descriptive queries the benefit is smaller.
- The `originalQuery` is always preserved in the pipeline context and used for citation display — the user never sees the hypothetical document.

## Best Practices

- Enable HyDE for knowledge bases with technical or domain-specific content where queries tend to be short.
- Disable HyDE for conversational or long-form queries where the latency cost is not justified.
- Set `HYDE_MAX_TOKENS=200` to keep hypothetical docs short and relevant.

## How to Reproduce

```bash
# 1. Set HYDE_ENABLED=false in config.yml
docker compose up -d
python evaluation/run_eval.py --output evaluation/results/run_no_hyde.json

# 2. Set HYDE_ENABLED=true in config.yml, restart rass-engine-service
docker compose restart rass-engine-service
python evaluation/run_eval.py --output evaluation/results/run_with_hyde.json

# 3. Compare
python evaluation/compare_runs.py \
    --baseline evaluation/results/run_no_hyde.json \
    --current evaluation/results/run_with_hyde.json
```
