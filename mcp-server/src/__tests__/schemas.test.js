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
});
