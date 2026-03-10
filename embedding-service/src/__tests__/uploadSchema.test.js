// embedding-service/src/__tests__/uploadSchema.test.js
// Unit tests for the upload endpoint Zod schema and validateBody middleware.

"use strict";

const { UploadBodySchema } = require("../schemas/uploadSchema");
const { validateBody } = require("../middleware/validate");

describe("UploadBodySchema", () => {
  test("valid userId passes", () => {
    const result = UploadBodySchema.safeParse({ userId: "user-123" });
    expect(result.success).toBe(true);
    expect(result.data.userId).toBe("user-123");
  });

  test("missing userId fails with details array", () => {
    const result = UploadBodySchema.safeParse({});
    expect(result.success).toBe(false);
    expect(Array.isArray(result.error.issues)).toBe(true);
    expect(result.error.issues[0].path).toContain("userId");
  });

  test("empty userId string fails", () => {
    const result = UploadBodySchema.safeParse({ userId: "" });
    expect(result.success).toBe(false);
  });

  test("non-string userId fails", () => {
    const result = UploadBodySchema.safeParse({ userId: 42 });
    expect(result.success).toBe(false);
  });

  test("valid chunkingStrategy passes", () => {
    const result = UploadBodySchema.safeParse({ userId: "u1", chunkingStrategy: "sentence_window" });
    expect(result.success).toBe(true);
    expect(result.data.chunkingStrategy).toBe("sentence_window");
  });

  test("invalid chunkingStrategy fails", () => {
    const result = UploadBodySchema.safeParse({ userId: "u1", chunkingStrategy: "invalid_strategy" });
    expect(result.success).toBe(false);
  });

  test("targetIndex optional string passes", () => {
    const result = UploadBodySchema.safeParse({ userId: "u1", targetIndex: "kb_myindex_123" });
    expect(result.success).toBe(true);
    expect(result.data.targetIndex).toBe("kb_myindex_123");
  });

  test("kbId optional string passes", () => {
    const result = UploadBodySchema.safeParse({ userId: "u1", kbId: "some-kb-id" });
    expect(result.success).toBe(true);
    expect(result.data.kbId).toBe("some-kb-id");
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
    const { req, res } = makeReqRes({ userId: "user-abc" });
    let called = false;
    validateBody(UploadBodySchema)(req, res, () => { called = true; });
    expect(called).toBe(true);
    expect(req.validatedBody.userId).toBe("user-abc");
  });

  test("invalid body returns 400 with details array", () => {
    const { req, res } = makeReqRes({});
    validateBody(UploadBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
    expect(res._json.error).toBe("Validation failed");
    expect(Array.isArray(res._json.details)).toBe(true);
  });

  test("wrong type returns 400", () => {
    const { req, res } = makeReqRes({ userId: 123 });
    validateBody(UploadBodySchema)(req, res, () => {});
    expect(res._status).toBe(400);
  });
});
