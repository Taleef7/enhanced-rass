# ADR 001: Use OpenSearch for Both BM25 Keyword and KNN Vector Search

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

RASS requires two distinct retrieval capabilities:
1. **Semantic (vector) search** — retrieve documents based on meaning, not keywords
2. **Keyword (lexical) search** — retrieve documents based on exact or near-exact term matches

We evaluated three approaches:
- Separate services: OpenSearch for BM25 + Pinecone/Weaviate for vectors
- PostgreSQL with pgvector for vectors + OpenSearch for BM25
- **OpenSearch alone** for both BM25 and KNN vectors (using the `knn` plugin)

## Decision

Use **OpenSearch** as the single vector and keyword search store, leveraging its `knn_vector` field type (HNSW index) alongside the native BM25 scorer via the `hybrid` query type.

## Rationale

- **Operational simplicity**: A single datastore eliminates cross-service join complexity and simplifies deployment.
- **Hybrid search in one query**: OpenSearch's `hybrid` query type natively combines BM25 and KNN scores with configurable weights in a single round-trip.
- **No sync overhead**: There is no need to keep a separate vector store in sync with OpenSearch indices.
- **HNSW performance**: OpenSearch's approximate KNN with HNSW provides sub-100ms retrieval at millions-of-vector scale.
- **Production track record**: OpenSearch is used in production for retrieval at scale in AWS, Elastic, and open-source deployments.

## Consequences

- **Positive**: Simpler infrastructure, single backup/restore target, no cross-store consistency issues.
- **Positive**: Native hybrid scoring with Reciprocal Rank Fusion (RRF) or normalization pipelines.
- **Negative**: OpenSearch's KNN index is RAM-intensive; each index keeps HNSW graphs in memory. Requires capacity planning.
- **Negative**: OpenSearch is less specialised than purpose-built vector databases (e.g., Pinecone). For billions of vectors, a dedicated ANN store may become necessary.
- **Mitigation**: Use separate OpenSearch indices per knowledge base / workspace to limit index size.

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Pinecone + OpenSearch | Extra infra, data sync complexity |
| pgvector + OpenSearch | Adds Postgres as a query path; less optimised for ANN at scale |
| Weaviate standalone | Requires separate BM25 stack; OpenSearch covers both |
