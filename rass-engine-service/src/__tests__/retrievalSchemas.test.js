// rass-engine-service/src/__tests__/retrievalSchemas.test.js
// Unit tests for retrievalSchemas — RetrievalHitSchema and CitationSchema.

"use strict";

const {
  RetrievalHitSchema,
  RetrievalResultSchema,
  CitationSchema,
  CitationListSchema,
} = require("../schemas/retrievalSchemas");

const VALID_HIT = {
  _id: "doc-001",
  _score: 0.87,
  _source: {
    text: "This is the relevant passage from the document.",
    metadata: {
      userId: "user-123",
      originalFilename: "report.pdf",
      uploadedAt: "2026-01-01T00:00:00.000Z",
      parentId: "parent-001",
    },
  },
};

const VALID_CITATION = {
  id: "cit-001",
  source: "report.pdf",
  score: 0.87,
  text: "This is the relevant passage.",
  uploadedAt: "2026-01-01T00:00:00.000Z",
};

describe("RetrievalHitSchema", () => {
  test("valid OpenSearch hit passes", () => {
    const result = RetrievalHitSchema.safeParse(VALID_HIT);
    expect(result.success).toBe(true);
  });

  test("hit missing _source.text fails with descriptive error", () => {
    const badHit = {
      ...VALID_HIT,
      _source: { ...VALID_HIT._source, text: undefined },
    };
    const result = RetrievalHitSchema.safeParse(badHit);
    expect(result.success).toBe(false);
    const paths = result.error.issues.map((i) => i.path.join("."));
    expect(paths.some((p) => p.includes("text"))).toBe(true);
  });

  test("hit missing _id fails", () => {
    const { _id, ...rest } = VALID_HIT;
    const result = RetrievalHitSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("extra metadata fields are preserved by passthrough()", () => {
    const hitWithExtra = {
      ...VALID_HIT,
      _source: {
        ...VALID_HIT._source,
        metadata: {
          ...VALID_HIT._source.metadata,
          customField: "extra-value",
          pageNumber: 5,
        },
      },
    };
    const result = RetrievalHitSchema.safeParse(hitWithExtra);
    expect(result.success).toBe(true);
    expect(result.data._source.metadata.customField).toBe("extra-value");
    expect(result.data._source.metadata.pageNumber).toBe(5);
  });
});

describe("RetrievalResultSchema", () => {
  test("array of valid hits passes", () => {
    expect(RetrievalResultSchema.safeParse([VALID_HIT, VALID_HIT]).success).toBe(true);
  });

  test("empty array passes (no hits)", () => {
    expect(RetrievalResultSchema.safeParse([]).success).toBe(true);
  });
});

describe("CitationSchema", () => {
  test("valid citation passes", () => {
    const result = CitationSchema.safeParse(VALID_CITATION);
    expect(result.success).toBe(true);
  });

  test("citation missing source fails", () => {
    const { source, ...rest } = VALID_CITATION;
    const result = CitationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("citation missing id fails", () => {
    const { id, ...rest } = VALID_CITATION;
    const result = CitationSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  test("uploadedAt is optional", () => {
    const { uploadedAt, ...rest } = VALID_CITATION;
    const result = CitationSchema.safeParse(rest);
    expect(result.success).toBe(true);
  });
});

describe("CitationListSchema", () => {
  test("array of valid citations passes", () => {
    expect(CitationListSchema.safeParse([VALID_CITATION]).success).toBe(true);
  });

  test("empty citation array passes", () => {
    expect(CitationListSchema.safeParse([]).success).toBe(true);
  });
});
