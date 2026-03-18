// mcp-server/src/gateway/mcpTools.js
// MCP tool definitions for RASS.
// Phase 7.1: Expanded tool set — web search, document management, memory, graph, KB.
//
// Available tools:
//   queryRASS              — Query the knowledge base (existing)
//   addDocumentToRASS      — Upload a file from shared volume (existing)
//   webSearch              — Live web search via Tavily (new)
//   listDocuments          — List documents in a knowledge base (new)
//   getDocumentSummary     — Retrieve document metadata + provenance (new)
//   searchMemories         — Search user memory facts by keyword (new)
//   addMemory              — Manually add a user memory fact (new)
//   queryKnowledgeGraph    — Query entity relationships in the graph (new)
//   listKnowledgeBases     — List available knowledge bases (new)
//   switchKnowledgeBase    — Returns info on how to target a specific KB (new)

"use strict";

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const { RASS_ENGINE_BASE_URL, EMBEDDING_SERVICE_BASE_URL } = require("../config");
const { prisma } = require("../prisma");
const { getUserMemories } = require("../services/memoryService");
const logger = require("../logger");

const { ResourceTemplate } = require("@modelcontextprotocol/sdk/server/mcp.js");

const server = new McpServer({
  name: "RASS-MCP-Server",
  version: "2.0.0",
});

// ── Helper: format result as text ─────────────────────────────────────────────
function textResult(obj) {
  return { content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING TOOLS (preserved)
// ─────────────────────────────────────────────────────────────────────────────

// Tool: queryRASS — queries the knowledge base via the RASS engine
server.tool(
  "queryRASS",
  {
    query: z.string().describe("The natural language question to ask the knowledge base."),
    top_k: z.optional(z.number()).describe("Optional. Max document chunks to retrieve."),
    kbId: z.optional(z.string()).describe("Optional. Knowledge base ID to scope the search."),
  },
  async (tool_args) => {
    logger.info("[MCP Tool 'queryRASS'] Executing with args:", tool_args);
    const { query, top_k, kbId } = tool_args;
    const response = await axios.post(`${RASS_ENGINE_BASE_URL}/ask`, { query, top_k, kbId });
    return textResult(response.data);
  }
);

// Tool: addDocumentToRASS — uploads a file from the shared volume to the embedding service
server.tool(
  "addDocumentToRASS",
  {
    source_uri: z.string().describe("Filename in the shared uploads volume to add to RASS."),
    kbId: z.optional(z.string()).describe("Optional. Target knowledge base ID."),
  },
  async ({ source_uri, kbId }) => {
    logger.info("[MCP Tool 'addDocumentToRASS'] Executing with uri:", source_uri);
    const UPLOAD_DIR_MCP = "/usr/src/app/uploads";
    const fullPath = path.join(UPLOAD_DIR_MCP, source_uri);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found at source_uri: ${source_uri}`);
    }

    const form = new FormData();
    form.append("files", fs.createReadStream(fullPath), path.basename(fullPath));
    if (kbId) form.append("kbId", kbId);

    const response = await axios.post(`${EMBEDDING_SERVICE_BASE_URL}/upload`, form, {
      headers: { ...form.getHeaders() },
    });
    return textResult(response.data);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.1: NEW TOOLS
// ─────────────────────────────────────────────────────────────────────────────

// Tool: webSearch — live web search via Tavily API
server.tool(
  "webSearch",
  {
    query: z.string().describe("The search query to look up on the web."),
    numResults: z.optional(z.number().min(1).max(10)).describe("Number of results to return (1-10). Default: 5."),
  },
  async ({ query, numResults = 5 }) => {
    logger.info("[MCP Tool 'webSearch'] Query:", query);

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return textResult({ error: "TAVILY_API_KEY is not configured. Set it in .env to enable web search." });
    }

    try {
      const response = await axios.post(
        "https://api.tavily.com/search",
        {
          api_key: apiKey,
          query,
          max_results: numResults,
          search_depth: "basic",
          include_answer: true,
        },
        { timeout: 15000 }
      );

      const { answer, results = [] } = response.data;
      return textResult({
        answer,
        results: results.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content?.slice(0, 500),
          score: r.score,
        })),
      });
    } catch (err) {
      logger.warn("[MCP Tool 'webSearch'] Tavily error:", err.message);
      return textResult({ error: `Web search failed: ${err.message}` });
    }
  }
);

// Tool: listDocuments — list documents, optionally scoped to a KB
server.tool(
  "listDocuments",
  {
    kbId: z.optional(z.string()).describe("Optional. Filter by knowledge base ID."),
    userId: z.optional(z.string()).describe("Optional. Filter by user ID."),
    status: z.optional(z.enum(["READY", "PROCESSING", "QUEUED", "FAILED"])).describe("Optional status filter. Default: READY."),
    limit: z.optional(z.number().min(1).max(100)).describe("Max results to return. Default: 20."),
  },
  async ({ kbId, userId, status = "READY", limit = 20 }) => {
    logger.info("[MCP Tool 'listDocuments'] kbId:", kbId, "userId:", userId);

    const where = { status };
    if (kbId) where.kbId = kbId;
    if (userId) where.userId = userId;

    const documents = await prisma.document.findMany({
      where,
      take: limit,
      orderBy: { uploadedAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        mimeType: true,
        fileSizeBytes: true,
        status: true,
        chunkCount: true,
        kbId: true,
        uploadedAt: true,
        processedAt: true,
      },
    });

    return textResult({ count: documents.length, documents });
  }
);

// Tool: getDocumentSummary — retrieve document metadata and provenance
server.tool(
  "getDocumentSummary",
  {
    documentId: z.string().describe("The RASS document ID to retrieve details for."),
  },
  async ({ documentId }) => {
    logger.info("[MCP Tool 'getDocumentSummary'] documentId:", documentId);

    const document = await prisma.document.findUnique({
      where: { id: documentId },
      include: { provenance: true },
    });

    if (!document) {
      return textResult({ error: `Document not found: ${documentId}` });
    }

    return textResult({
      id: document.id,
      filename: document.originalFilename,
      mimeType: document.mimeType,
      fileSizeBytes: document.fileSizeBytes,
      status: document.status,
      chunkCount: document.chunkCount,
      kbId: document.kbId,
      openSearchIndex: document.openSearchIndex,
      uploadedAt: document.uploadedAt,
      processedAt: document.processedAt,
      provenance: document.provenance
        ? {
            embeddingModel: document.provenance.embeddingModel,
            embeddingDim: document.provenance.embeddingDim,
            chunkCount: document.provenance.chunkCount,
            parentCount: document.provenance.parentCount,
            pageCount: document.provenance.pageCount,
            chunkingStrategy: document.provenance.chunkingStrategy,
            stagesMs: document.provenance.stagesMs,
          }
        : null,
    });
  }
);

// Tool: searchMemories — search user memory facts by keyword
server.tool(
  "searchMemories",
  {
    userId: z.string().describe("The user ID whose memories to search."),
    query: z.optional(z.string()).describe("Optional. Keyword filter for memory facts."),
    category: z.optional(z.enum(["preference", "expertise", "context", "goal"])).describe("Optional. Filter by category."),
    limit: z.optional(z.number().min(1).max(20)).describe("Max results. Default: 5."),
  },
  async ({ userId, query, category, limit = 5 }) => {
    logger.info("[MCP Tool 'searchMemories'] userId:", userId);

    const memories = await getUserMemories(userId, { limit, category, query });

    return textResult({
      userId,
      count: memories.length,
      memories: memories.map((m) => ({
        id: m.id,
        fact: m.fact,
        category: m.category,
        createdAt: m.createdAt,
      })),
    });
  }
);

// Tool: addMemory — manually add a memory fact for a user
server.tool(
  "addMemory",
  {
    userId: z.string().describe("The user ID to add the memory for."),
    fact: z.string().min(1).describe("The memorable fact to store."),
    category: z.enum(["preference", "expertise", "context", "goal"]).describe("Category of the memory fact."),
  },
  async ({ userId, fact, category }) => {
    logger.info("[MCP Tool 'addMemory'] userId:", userId);

    const memory = await prisma.memory.create({
      data: { userId, fact: fact.trim(), category, chatId: null },
    });

    return textResult({ success: true, memory: { id: memory.id, fact: memory.fact, category: memory.category } });
  }
);

// Tool: queryKnowledgeGraph — query entities and relationships
server.tool(
  "queryKnowledgeGraph",
  {
    entity: z.string().describe("Entity name to look up in the knowledge graph."),
    kbId: z.optional(z.string()).describe("Optional. Scope to a specific knowledge base."),
    hops: z.optional(z.number().min(1).max(3)).describe("Relationship traversal depth (1-3). Default: 1."),
    limit: z.optional(z.number().min(1).max(50)).describe("Max entities to return. Default: 10."),
  },
  async ({ entity, kbId, hops = 1, limit = 10 }) => {
    logger.info("[MCP Tool 'queryKnowledgeGraph'] entity:", entity);

    const where = {
      name: { contains: entity, mode: "insensitive" },
    };
    if (kbId) where.kbId = kbId;

    const entities = await prisma.entity.findMany({
      where,
      take: limit,
      include: {
        subjectOf: {
          take: hops <= 1 ? 10 : 5,
          include: {
            Object: { select: { id: true, name: true, type: true } },
          },
        },
        objectOf: {
          take: hops <= 1 ? 10 : 5,
          include: {
            Subject: { select: { id: true, name: true, type: true } },
          },
        },
      },
    });

    return textResult({
      query: entity,
      entityCount: entities.length,
      entities: entities.map((e) => ({
        id: e.id,
        name: e.name,
        type: e.type,
        kbId: e.kbId,
        outgoingRelations: e.subjectOf.map((r) => ({
          predicate: r.predicate,
          target: r.Object?.name,
          targetType: r.Object?.type,
        })),
        incomingRelations: e.objectOf.map((r) => ({
          predicate: r.predicate,
          source: r.Subject?.name,
          sourceType: r.Subject?.type,
        })),
      })),
    });
  }
);

// Tool: listKnowledgeBases — list available knowledge bases
server.tool(
  "listKnowledgeBases",
  {
    userId: z.optional(z.string()).describe("Optional. Filter to KBs accessible to this user."),
    limit: z.optional(z.number().min(1).max(100)).describe("Max results. Default: 20."),
  },
  async ({ userId, limit = 20 }) => {
    logger.info("[MCP Tool 'listKnowledgeBases'] userId:", userId);

    const where = {};
    if (userId) {
      where.OR = [
        { ownerId: userId },
        { isPublic: true },
        { members: { some: { userId } } },
      ];
    }

    const kbs = await prisma.knowledgeBase.findMany({
      where,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { documents: true, members: true } },
      },
    });

    return textResult({
      count: kbs.length,
      knowledgeBases: kbs.map((kb) => ({
        id: kb.id,
        name: kb.name,
        description: kb.description,
        isPublic: kb.isPublic,
        documentCount: kb._count.documents,
        memberCount: kb._count.members,
        embeddingModel: kb.embeddingModel,
        openSearchIndex: kb.openSearchIndex,
        createdAt: kb.createdAt,
      })),
    });
  }
);

// Tool: switchKnowledgeBase — returns the kbId to use in queryRASS
server.tool(
  "switchKnowledgeBase",
  {
    kbId: z.string().describe("The knowledge base ID to target for subsequent queries."),
  },
  async ({ kbId }) => {
    logger.info("[MCP Tool 'switchKnowledgeBase'] kbId:", kbId);

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      select: { id: true, name: true, description: true, openSearchIndex: true },
    });

    if (!kb) {
      return textResult({ error: `Knowledge base not found: ${kbId}` });
    }

    return textResult({
      message: `To query "${kb.name}", pass kbId: "${kbId}" in your queryRASS calls.`,
      kbId: kb.id,
      name: kb.name,
      description: kb.description,
      openSearchIndex: kb.openSearchIndex,
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 7.3: MCP RESOURCES — Knowledge Bases as MCP resources
//
// Exposes RASS knowledge bases as MCP resources so any MCP-compatible client
// (OpenWebUI, Claude Desktop, etc.) can discover and browse them via
// resources/list and resources/read protocol methods.
//
// URI scheme: rass://kb/{kbId}
// ─────────────────────────────────────────────────────────────────────────────

// Resource: list all knowledge bases
server.resource(
  "knowledge-bases",
  "rass://kb",
  async (uri) => {
    logger.info("[MCP Resource 'knowledge-bases'] Listing all KBs");

    const kbs = await prisma.knowledgeBase.findMany({
      take: 50,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { documents: true } } },
    });

    const content = JSON.stringify(
      {
        knowledgeBases: kbs.map((kb) => ({
          uri: `rass://kb/${kb.id}`,
          name: kb.name,
          description: kb.description,
          documentCount: kb._count.documents,
          isPublic: kb.isPublic,
          embeddingModel: kb.embeddingModel,
          createdAt: kb.createdAt,
        })),
      },
      null,
      2
    );

    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: content }],
    };
  }
);

// Resource template: individual knowledge base by ID
server.resource(
  "knowledge-base",
  new ResourceTemplate("rass://kb/{kbId}", { list: undefined }),
  async (uri, { kbId }) => {
    logger.info(`[MCP Resource 'knowledge-base'] kbId=${kbId}`);

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: kbId },
      include: {
        _count: { select: { documents: true, members: true } },
        documents: {
          take: 20,
          where: { status: "READY" },
          orderBy: { uploadedAt: "desc" },
          select: {
            id: true,
            originalFilename: true,
            mimeType: true,
            chunkCount: true,
            uploadedAt: true,
          },
        },
      },
    });

    if (!kb) {
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ error: `Knowledge base not found: ${kbId}` }),
          },
        ],
      };
    }

    const content = JSON.stringify(
      {
        id: kb.id,
        name: kb.name,
        description: kb.description,
        isPublic: kb.isPublic,
        embeddingModel: kb.embeddingModel,
        openSearchIndex: kb.openSearchIndex,
        documentCount: kb._count.documents,
        memberCount: kb._count.members,
        recentDocuments: kb.documents,
        createdAt: kb.createdAt,
      },
      null,
      2
    );

    return {
      contents: [{ uri: uri.href, mimeType: "application/json", text: content }],
    };
  }
);

module.exports = { server };
