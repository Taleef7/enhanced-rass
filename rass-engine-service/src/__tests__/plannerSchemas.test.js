// rass-engine-service/src/__tests__/plannerSchemas.test.js
// Unit tests for plannerSchemas — SearchPlanSchema, PlanStepSchema, ExecutionPlanSchema.

"use strict";

const {
  SearchTermSchema,
  SearchPlanSchema,
  PlanStepSchema,
  ExecutionPlanSchema,
} = require("../schemas/plannerSchemas");

describe("SearchTermSchema", () => {
  test("valid non-empty string passes", () => {
    expect(SearchTermSchema.safeParse("machine learning").success).toBe(true);
  });

  test("empty string fails", () => {
    expect(SearchTermSchema.safeParse("").success).toBe(false);
  });

  test("string longer than 500 characters fails", () => {
    expect(SearchTermSchema.safeParse("x".repeat(501)).success).toBe(false);
  });
});

describe("SearchPlanSchema", () => {
  const validPlan = ["term one", "term two", "term three"];

  test("valid array of 1–10 terms passes", () => {
    const result = SearchPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validPlan);
  });

  test("empty array fails with min(1) error", () => {
    const result = SearchPlanSchema.safeParse([]);
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/at least 1/i);
  });

  test("array of 11 items fails with max(10) error", () => {
    const result = SearchPlanSchema.safeParse(Array.from({ length: 11 }, (_, i) => `term${i}`));
    expect(result.success).toBe(false);
    expect(result.error.issues[0].message).toMatch(/at most 10/i);
  });

  test("array with an empty string term fails", () => {
    expect(SearchPlanSchema.safeParse(["valid", ""]).success).toBe(false);
  });
});

describe("PlanStepSchema", () => {
  test("valid step with required query passes", () => {
    const result = PlanStepSchema.safeParse({ query: "what is RASS?" });
    expect(result.success).toBe(true);
    expect(result.data.method).toBe("hybrid"); // default
  });

  test("valid step with all fields passes", () => {
    const result = PlanStepSchema.safeParse({ query: "test", method: "knn", top_k: 5 });
    expect(result.success).toBe(true);
  });

  test("invalid method enum fails", () => {
    const result = PlanStepSchema.safeParse({ query: "test", method: "fuzzy" });
    expect(result.success).toBe(false);
  });

  test("missing query fails", () => {
    const result = PlanStepSchema.safeParse({ method: "knn" });
    expect(result.success).toBe(false);
  });

  test("empty query fails", () => {
    const result = PlanStepSchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });
});

describe("ExecutionPlanSchema", () => {
  const validPlan = [
    { query: "search term one", method: "hybrid" },
    { query: "search term two", method: "knn", top_k: 10 },
  ];

  test("valid plan array passes", () => {
    const result = ExecutionPlanSchema.safeParse(validPlan);
    expect(result.success).toBe(true);
  });

  test("empty plan array fails", () => {
    expect(ExecutionPlanSchema.safeParse([]).success).toBe(false);
  });

  test("plan with invalid step method fails", () => {
    expect(ExecutionPlanSchema.safeParse([{ query: "test", method: "invalid" }]).success).toBe(false);
  });
});
