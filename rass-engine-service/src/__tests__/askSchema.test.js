// rass-engine-service/src/__tests__/askSchema.test.js
// Unit tests for AskBodySchema, StreamAskBodySchema, and validateBody middleware.

"use strict";

const { AskBodySchema, StreamAskBodySchema } = require("../schemas/askSchema");
const { validateBody } = require("../middleware/validate");

describe("AskBodySchema", () => {
  test("valid query passes", () => {
    const result = AskBodySchema.safeParse({ query: "What is RASS?" });
    expect(result.success).toBe(true);
    expect(result.data.query).toBe("What is RASS?");
  });

  test("missing query fails with details array", () => {
    const result = AskBodySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(Array.isArray(result.error.issues)).toBe(true);
  });

  test("empty query string fails", () => {
    const result = AskBodySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  test("valid query with optional top_k passes", () => {
    const result = AskBodySchema.safeParse({ query: "test", top_k: 5 });
    expect(result.success).toBe(true);
    expect(result.data.top_k).toBe(5);
  });

  test("top_k as string 'ten' fails (wrong type)", () => {
    const result = AskBodySchema.safeParse({ query: "test", top_k: "ten" });
    expect(result.success).toBe(false);
  });

  test("top_k as zero fails (not positive)", () => {
    const result = AskBodySchema.safeParse({ query: "test", top_k: 0 });
    expect(result.success).toBe(false);
  });

  test("optional userId accepted", () => {
    const result = AskBodySchema.safeParse({ query: "test", userId: "user-1" });
    expect(result.success).toBe(true);
    expect(result.data.userId).toBe("user-1");
  });
});

describe("StreamAskBodySchema", () => {
  test("valid body without userId passes", () => {
    const result = StreamAskBodySchema.safeParse({ query: "stream me" });
    expect(result.success).toBe(true);
  });

  test("valid body with all fields passes", () => {
    const result = StreamAskBodySchema.safeParse({
      query: "test",
      top_k: 10,
      userId: "user-1",
      documents: ["doc-a", "doc-b"],
    });
    expect(result.success).toBe(true);
  });

  test("missing query fails", () => {
    const result = StreamAskBodySchema.safeParse({ userId: "u1" });
    expect(result.success).toBe(false);
  });
});

describe("validateBody middleware", () => {
  function makeReqRes(body) {
    const req = { body };
    const res = {
      _status: null,
      _json: null,
      status(code) { this._status = code; return this; },
      json(data) { this._json = data; return this; },
    };
    return { req, res };
  }

  test("valid body attaches req.validatedBody and calls next()", () => {
    const { req, res } = makeReqRes({ query: "hello" });
    let called = false;
    validateBody(AskBodySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.validatedBody.query).toBe("hello");
  });

  test("invalid body returns 400 with details array", () => {
    const { req, res } = makeReqRes({});
    validateBody(AskBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._json.error).toBe("Validation failed");
    expect(Array.isArray(res._json.details)).toBe(true);
  });

  test("wrong type for top_k returns 400", () => {
    const { req, res } = makeReqRes({ query: "test", top_k: "ten" });
    validateBody(AskBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
  });
});
