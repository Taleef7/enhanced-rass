# ADR 003: Multi-Tenant Isolation via Per-Knowledge-Base OpenSearch Indices

**Date:** 2025-01-15
**Status:** Accepted
**Author:** RASS Architecture Team

## Context

RASS supports multiple tenants (users, teams, organizations) uploading documents and querying. We must ensure:
- A user cannot retrieve documents from another user's knowledge base
- Teams can share knowledge bases across members with RBAC (Owner/Editor/Viewer roles)
- Deleting a knowledge base must be clean with no cross-tenant data leakage

Three isolation strategies were evaluated:
1. **Field-based filtering**: Single index, filter by `userId`/`kbId` field on every query
2. **Per-knowledge-base indices**: Separate OpenSearch index per KB
3. **Per-organisation indices**: Shared index per org, filtered by workspace/team

## Decision

Use **per-knowledge-base OpenSearch indices**. Each knowledge base gets its own dedicated index provisioned at KB creation time. All queries to that KB are scoped to its index.

## Rationale

- **Strict isolation**: Zero risk of cross-tenant data leakage regardless of query construction errors. No filter-bypass bugs.
- **Clean deletion**: Deleting a KB deletes its entire OpenSearch index — no tombstones or background cleanup jobs.
- **Performance**: Smaller indices per KB → faster KNN retrieval and more focused BM25 scoring. No cross-tenant noise in relevance.
- **Index-level access control**: Future integration with OpenSearch Document-Level Security (DLS) is per-index.

## Consequences

- **Positive**: Simple security model; easy to reason about and audit.
- **Positive**: KB-level index settings (embedDim, chunk size) can differ per KB.
- **Negative**: OpenSearch has per-shard overhead. Many small KBs (thousands) can strain cluster shard count. OpenSearch recommends < 1000 shards per node.
- **Negative**: Searching across multiple KBs requires querying each index separately or using OpenSearch's multi-index (`index1,index2`) syntax.
- **Mitigation**: Set `number_of_shards: 1` for small KBs; implement shard consolidation for large deployments. Monitor with `GET _cluster/health`.

## Implementation

```
POST /api/knowledge-bases
→ Prisma: create KnowledgeBase record (id, name, ownerId, openSearchIndex)
→ OpenSearch: PUT /rass-kb-{uuid} (with knn_vector mapping)

POST /api/embed-upload (with kbId)
→ Documents indexed to rass-kb-{uuid} instead of global knowledge_base index

DELETE /api/knowledge-bases/:kbId
→ OpenSearch: DELETE /rass-kb-{uuid}
→ Prisma: delete all KnowledgeBase documents and the KB record
```

## Alternatives Considered

| Option | Why Rejected |
|--------|-------------|
| Single index with `userId` filter | Filter bypass risk; worse performance; hard deletion |
| Per-org shared index | Multi-team leakage risk without complex DLS; complex cross-team queries |
