#!/usr/bin/env python3
"""
evaluation/run_eval.py
======================
CLI evaluation runner for the Enhanced RASS system.

Usage:
    python evaluation/run_eval.py [options]

Options:
    --url       RASS engine base URL (default: http://localhost:8000)
    --test-set  Path to test set JSON (default: evaluation/datasets/test_set.json)
    --output    Path for results JSON (default: evaluation/results/run_<timestamp>.json)
    --top-k     Number of documents to retrieve per query (default: 5)

Metrics produced per query:
    context_relevance    - how relevant retrieved context is to the query (TruLens)
    answer_faithfulness  - how faithful the answer is to the context (TruLens)
    answer_relevance     - how relevant the answer is to the question (TruLens)
    recall_at_5          - whether expected keywords appear in top-5 context
    latency_ms           - wall-clock response time in milliseconds

Aggregates produced:
    mean, p50, p95 for each metric.
"""

import argparse
import json
import logging
import os
import re
import statistics
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# RASS query helper
# ---------------------------------------------------------------------------

def query_rass(base_url: str, query: str, top_k: int = 5, timeout: int = 60) -> dict:
    """
    Call POST /ask on the RASS engine and return:
        { "answer": str, "context": str, "source_documents": list, "latency_ms": float }

    Falls back to streaming endpoint if /ask is unavailable.
    """
    start = time.monotonic()
    try:
        resp = requests.post(
            f"{base_url}/ask",
            json={"query": query, "top_k": top_k},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        latency_ms = (time.monotonic() - start) * 1000

        answer = data.get("answer", "")
        source_docs = data.get("source_documents", [])
        context_parts = []
        for doc in source_docs:
            if isinstance(doc, dict):
                text = doc.get("_source", {}).get("text") or doc.get("text", "")
                if text:
                    context_parts.append(text)
        context = "\n\n".join(context_parts)

        return {
            "answer": answer,
            "context": context,
            "source_documents": source_docs,
            "latency_ms": latency_ms,
        }
    except requests.exceptions.RequestException as exc:
        latency_ms = (time.monotonic() - start) * 1000
        log.error(f"RASS request failed for query '{query[:60]}': {exc}")
        return {
            "answer": f"ERROR: {exc}",
            "context": "",
            "source_documents": [],
            "latency_ms": latency_ms,
        }


# ---------------------------------------------------------------------------
# Simple keyword-based metrics (used when TruLens is unavailable)
# ---------------------------------------------------------------------------

def keyword_recall(answer: str, context: str, expected_keywords: list) -> float:
    """Return the fraction of expected keywords found in (answer + context)."""
    if not expected_keywords:
        return 1.0
    combined = (answer + " " + context).lower()
    found = sum(1 for kw in expected_keywords if kw.lower() in combined)
    return found / len(expected_keywords)


def simple_answer_relevance(query: str, answer: str) -> float:
    """
    Heuristic: fraction of query non-stopword tokens found in the answer.
    Returns 0.0–1.0.
    """
    stopwords = {"what", "is", "the", "a", "an", "of", "in", "did", "how", "why", "who", "where"}
    tokens = [t for t in re.findall(r"\w+", query.lower()) if t not in stopwords and len(t) > 2]
    if not tokens:
        return 0.5
    answer_lower = answer.lower()
    found = sum(1 for t in tokens if t in answer_lower)
    return found / len(tokens)


def simple_context_relevance(query: str, context: str) -> float:
    """
    Heuristic: fraction of query non-stopword tokens found in the context.
    """
    stopwords = {"what", "is", "the", "a", "an", "of", "in", "did", "how", "why", "who", "where"}
    tokens = [t for t in re.findall(r"\w+", query.lower()) if t not in stopwords and len(t) > 2]
    if not tokens:
        return 0.5
    context_lower = context.lower()
    found = sum(1 for t in tokens if t in context_lower)
    return found / len(tokens)


# ---------------------------------------------------------------------------
# TruLens integration (optional)
# ---------------------------------------------------------------------------

def try_trulens_eval(query: str, answer: str, context: str) -> dict:
    """
    Attempt TruLens metric evaluation. Returns None if TruLens is not available.
    """
    try:
        import numpy as np
        from trulens.core import Feedback, Select
        from trulens.providers.openai import OpenAI

        provider = OpenAI()

        select_context = lambda: context  # noqa: E731

        f_groundedness = provider.groundedness_measure_with_cot_reasons
        f_answer_relevance = provider.relevance
        f_context_relevance = provider.context_relevance

        # Evaluate synchronously using the provider's methods directly
        gr_score = provider.groundedness_measure_with_cot_reasons(
            source=context, statement=answer
        )
        ar_score = provider.relevance(prompt=query, response=answer)
        cr_score = provider.context_relevance(question=query, context=context)

        return {
            "answer_faithfulness": float(gr_score[0]) if isinstance(gr_score, tuple) else float(gr_score),
            "answer_relevance": float(ar_score),
            "context_relevance": float(cr_score),
            "trulens_available": True,
        }
    except Exception as exc:
        log.debug(f"TruLens evaluation skipped: {exc}")
        return None


# ---------------------------------------------------------------------------
# Percentile helper
# ---------------------------------------------------------------------------

def percentile(data: list, pct: float) -> float:
    if not data:
        return 0.0
    sorted_data = sorted(data)
    idx = max(0, int(len(sorted_data) * pct / 100) - 1)
    return sorted_data[idx]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Enhanced RASS Evaluation Runner")
    parser.add_argument("--url", default=os.environ.get("RASS_URL", "http://localhost:8000"),
                        help="RASS engine base URL")
    parser.add_argument("--test-set",
                        default=str(Path(__file__).parent / "datasets" / "test_set.json"),
                        help="Path to the labeled test set JSON")
    parser.add_argument("--output", default=None,
                        help="Output path for results JSON (auto-named if omitted)")
    parser.add_argument("--top-k", type=int, default=5,
                        help="Number of documents to retrieve per query")
    parser.add_argument("--verbose", action="store_true", help="Show per-query details")
    args = parser.parse_args()

    # Load test set
    test_set_path = Path(args.test_set)
    if not test_set_path.exists():
        log.error(f"Test set not found: {test_set_path}")
        sys.exit(1)

    with open(test_set_path) as f:
        test_set = json.load(f)

    log.info(f"Loaded {len(test_set)} test cases from {test_set_path}")
    log.info(f"RASS URL: {args.url}  top_k={args.top_k}")

    # Determine output path
    timestamp = datetime.now(tz=timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_path = Path(args.output) if args.output else (
        Path(__file__).parent / "results" / f"run_{timestamp}.json"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    results = []
    per_metric = {
        "context_relevance": [],
        "answer_faithfulness": [],
        "answer_relevance": [],
        "recall_at_5": [],
        "latency_ms": [],
    }

    for i, item in enumerate(test_set, start=1):
        qid = item.get("id", f"q{i:03d}")
        query = item["query"]
        expected_kws = item.get("expected_answer_contains", [])
        is_negative = item.get("expected_negative", False)

        log.info(f"[{i}/{len(test_set)}] Running query {qid}: \"{query[:70]}\"")

        resp = query_rass(args.url, query, top_k=args.top_k)
        answer = resp["answer"]
        context = resp["context"]
        latency = resp["latency_ms"]

        # Recall@5
        if is_negative:
            recall = 1.0  # no expected keywords; treat as pass
        else:
            recall = keyword_recall(answer, context, expected_kws)

        # Try TruLens first, fall back to heuristics
        trulens_scores = try_trulens_eval(query, answer, context)
        if trulens_scores:
            ctx_rel = trulens_scores["context_relevance"]
            ans_faith = trulens_scores["answer_faithfulness"]
            ans_rel = trulens_scores["answer_relevance"]
            metric_source = "trulens"
        else:
            ctx_rel = simple_context_relevance(query, context)
            ans_faith = recall  # heuristic proxy
            ans_rel = simple_answer_relevance(query, answer)
            metric_source = "heuristic"

        row = {
            "id": qid,
            "category": item.get("category", "unknown"),
            "query": query,
            "answer": answer[:300],
            "context_relevance": round(ctx_rel, 4),
            "answer_faithfulness": round(ans_faith, 4),
            "answer_relevance": round(ans_rel, 4),
            "recall_at_5": round(recall, 4),
            "latency_ms": round(latency, 1),
            "metric_source": metric_source,
        }
        results.append(row)

        per_metric["context_relevance"].append(ctx_rel)
        per_metric["answer_faithfulness"].append(ans_faith)
        per_metric["answer_relevance"].append(ans_rel)
        per_metric["recall_at_5"].append(recall)
        per_metric["latency_ms"].append(latency)

        if args.verbose:
            log.info(
                f"  ctx_rel={ctx_rel:.3f}  ans_faith={ans_faith:.3f}  "
                f"ans_rel={ans_rel:.3f}  recall={recall:.3f}  "
                f"latency={latency:.0f}ms  [{metric_source}]"
            )

        # Polite rate-limit pause
        time.sleep(1)

    # Aggregate statistics
    aggregates = {}
    for metric, values in per_metric.items():
        if not values:
            continue
        aggregates[metric] = {
            "mean": round(statistics.mean(values), 4),
            "p50": round(percentile(values, 50), 4),
            "p95": round(percentile(values, 95), 4),
            "min": round(min(values), 4),
            "max": round(max(values), 4),
        }

    output = {
        "run_id": timestamp,
        "run_at": datetime.now(tz=timezone.utc).isoformat(),
        "rass_url": args.url,
        "top_k": args.top_k,
        "test_set": str(test_set_path),
        "n_queries": len(test_set),
        "aggregates": aggregates,
        "per_query": results,
    }

    with open(output_path, "w") as f:
        json.dump(output, f, indent=2)

    log.info(f"\n{'='*60}")
    log.info(f"Evaluation complete. Results written to: {output_path}")
    log.info(f"{'='*60}")
    for metric, stats in aggregates.items():
        log.info(f"  {metric:25s}  mean={stats['mean']:.3f}  p50={stats['p50']:.3f}  p95={stats['p95']:.3f}")
    log.info(f"{'='*60}")


if __name__ == "__main__":
    main()
