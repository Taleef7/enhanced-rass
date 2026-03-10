// mcp-server/src/__tests__/schemas.test.js
// Unit tests for mcp-server Zod schemas and validateBody/validateQuery middleware.

"use strict";

const { StreamAskBodySchema } = require("../schemas/streamAskSchema");
const { ChatCompletionsBodySchema } = require("../schemas/chatCompletionsSchema");
const { UserDocumentsQuerySchema } = require("../schemas/userDocumentsSchema");
const { validateBody, validateQuery } = require("../middleware/validate");

function makeReqRes(body, query) {
  const req = { body: body || {}, query: query || {} };
  const res = {
    _status: null,
    _json: null,
    status(code) { this._status = code; return this; },
    json(data) { this._json = data; return this; },
  };
  return { req, res };
}

// ---------------------------------------------------------------------------
// StreamAskBodySchema
// ---------------------------------------------------------------------------
describe("StreamAskBodySchema", () => {
  test("valid query passes and attaches validatedBody", () => {
    const { req, res } = makeReqRes({ query: "What is RAG?" });
    let called = false;
    validateBody(StreamAskBodySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.validatedBody.query).toBe("What is RAG?");
  });

  test("missing query returns 400 with details array", () => {
    const { req, res } = makeReqRes({});
    validateBody(StreamAskBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
    expect(Array.isArray(res._json.details)).toBe(true);
  });

  test("top_k as string 'ten' returns 400 (wrong type)", () => {
    const { req, res } = makeReqRes({ query: "test", top_k: "ten" });
    validateBody(StreamAskBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
  });

  test("valid query with top_k and documents passes", () => {
    const { req, res } = makeReqRes({ query: "test", top_k: 5, documents: ["doc1"] });
    let called = false;
    validateBody(StreamAskBodySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ChatCompletionsBodySchema
// ---------------------------------------------------------------------------
describe("ChatCompletionsBodySchema", () => {
  const validMessages = [
    { role: "user", content: "What is RASS?" },
  ];

  test("valid messages array passes", () => {
    const result = ChatCompletionsBodySchema.safeParse({ messages: validMessages });
    expect(result.success).toBe(true);
  });

  test("empty messages array fails", () => {
    const result = ChatCompletionsBodySchema.safeParse({ messages: [] });
    expect(result.success).toBe(false);
  });

  test("last message not role 'user' fails", () => {
    const result = ChatCompletionsBodySchema.safeParse({
      messages: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" },
      ],
    });
    expect(result.success).toBe(false);
  });

  test("missing messages field returns 400 via middleware", () => {
    const { req, res } = makeReqRes({});
    validateBody(ChatCompletionsBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
    expect(Array.isArray(res._json.details)).toBe(true);
  });

  test("array content for last user message passes", () => {
    const result = ChatCompletionsBodySchema.safeParse({
      messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UserDocumentsQuerySchema
// ---------------------------------------------------------------------------
describe("UserDocumentsQuerySchema", () => {
  test("empty query params passes (all optional)", () => {
    const result = UserDocumentsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
  });

  test("valid page and limit strings are coerced to numbers", () => {
    const result = UserDocumentsQuerySchema.safeParse({ page: "2", limit: "50" });
    expect(result.success).toBe(true);
    expect(result.data.page).toBe(2);
    expect(result.data.limit).toBe(50);
  });

  test("limit of 0 fails (min 1)", () => {
    const result = UserDocumentsQuerySchema.safeParse({ limit: "0" });
    expect(result.success).toBe(false);
  });

  test("limit of 101 fails (max 100)", () => {
    const result = UserDocumentsQuerySchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });

  test("validateQuery middleware returns 400 for invalid limit", () => {
    const { req, res } = makeReqRes(null, { limit: "200" });
    validateQuery(UserDocumentsQuerySchema)(req, res, () => {});
    expect(res._status).toBe(400);
  });

  test("valid query attaches req.validatedQuery and calls next()", () => {
    const { req, res } = makeReqRes(null, { page: "1", limit: "25" });
    let called = false;
    validateQuery(UserDocumentsQuerySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.validatedQuery.page).toBe(1);
    expect(req.validatedQuery.limit).toBe(25);
  });

  test("decimal page value '2.5' is rejected (not a valid integer)", () => {
    const result = UserDocumentsQuerySchema.safeParse({ page: "2.5" });
    expect(result.success).toBe(false);
  });

  test("decimal limit value '10.5' is rejected (not a valid integer)", () => {
    const result = UserDocumentsQuerySchema.safeParse({ limit: "10.5" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// KBCreateSchema
// ---------------------------------------------------------------------------
const { KBCreateSchema } = require("../schemas/knowledgeBaseSchema");

describe("KBCreateSchema", () => {
  test("valid name-only body passes", () => {
    const result = KBCreateSchema.safeParse({ name: "My KB" });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("My KB");
    expect(result.data.isPublic).toBe(false); // default
  });

  test("name is required — empty string fails", () => {
    const result = KBCreateSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  test("name is required — missing fails", () => {
    const result = KBCreateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("valid embedDim positive integer passes", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embedDim: 768 });
    expect(result.success).toBe(true);
    expect(result.data.embedDim).toBe(768);
  });

  test("embedDim = 0 fails (must be positive)", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embedDim: 0 });
    expect(result.success).toBe(false);
  });

  test("embedDim = -1 fails (must be positive)", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embedDim: -1 });
    expect(result.success).toBe(false);
  });

  test("embedDim = 1.5 (non-integer) fails", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embedDim: 1.5 });
    expect(result.success).toBe(false);
  });

  test("valid known embeddingModel passes", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embeddingModel: "text-embedding-3-large" });
    expect(result.success).toBe(true);
  });

  test("unknown embeddingModel fails", () => {
    const result = KBCreateSchema.safeParse({ name: "KB", embeddingModel: "unknown-model" });
    expect(result.success).toBe(false);
  });

  test("full valid body passes", () => {
    const result = KBCreateSchema.safeParse({
      name: "Research KB",
      description: "My research knowledge base",
      isPublic: true,
      embeddingModel: "text-embedding-004",
      embedDim: 768,
    });
    expect(result.success).toBe(true);
    expect(result.data.description).toBe("My research knowledge base");
    expect(result.data.isPublic).toBe(true);
  });
});
