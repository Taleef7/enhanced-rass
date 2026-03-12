# ADR 002: Parent-Child Chunking Strategy for RAG

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

The quality of a RAG system's answers depends critically on the granularity and structure of the text chunks stored in the vector index. Chunks that are too large lose precision (retrieved chunks contain irrelevant text); chunks that are too small lose context (the LLM lacks enough surrounding information to generate a coherent answer).

We evaluated:
- Fixed-size chunking (N tokens, stride S)
- Sentence-level chunking
- **Parent-child (hierarchical) chunking**
- Semantic chunking (split on embedding dissimilarity)

## Decision

Use **parent-child chunking** as the default strategy:

- **Parent chunks**: 512-token windows stored in Redis for LLM context retrieval. These provide rich, coherent passages for the LLM prompt.
- **Child chunks**: 128-token overlapping slices indexed in OpenSearch (both BM25 and KNN). These enable precise, targeted retrieval.

At query time, we retrieve by child chunks but pass parent chunks to the LLM, combining retrieval precision with generation context richness.

## Rationale

- **Best answer quality**: Parent chunks give the LLM sufficient context; child chunks give the retrieval system precision — combining both outperforms either alone.
- **Proven pattern**: First described in LlamaIndex's "Small-to-Big" retrieval; replicated across multiple RAG benchmarks.
- **Configurable**: The chunking strategy is configurable per-upload (fixed_size, recursive_character, sentence_window) so users can choose based on document type.
- **Redis for parents**: Parent chunks are stored in Redis with O(1) key lookup by `parentId`, enabling fast context assembly without OpenSearch round-trips.

## Consequences

- **Positive**: Higher answer faithfulness and reduced hallucination vs. fixed-size chunking.
- **Positive**: Chunk size is tunable without reindexing (child granularity affects only OpenSearch; parent granularity affects only Redis).
- **Negative**: Two storage systems needed (OpenSearch + Redis). Adds operational complexity.
- **Negative**: Redis memory usage scales with document corpus size. Monitor with `INFO memory`.
- **Mitigation**: Redis LRU eviction is configured for the parent chunk namespace; cold documents can be re-fetched from source on cache miss.

## Implementation

```
Document → Parser → Chunker
                    ├── Parent chunks (512 tok) → Redis (key: parentId)
                    └── Child chunks  (128 tok) → OpenSearch (knn_vector + text BM25)

Query → Embed query → KNN search (child) → fetch parentId → Redis GET → LLM context
```

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Fixed-size only | Lower answer quality; no context enrichment |
| Semantic chunking | Expensive to compute; marginal quality gain vs. parent-child |
| Document-level | Retrieved chunks too long for LLM context window at scale |
