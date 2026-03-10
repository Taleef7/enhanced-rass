// rass-engine-service/src/schemas/plannerSchemas.js
// Zod schemas for the LLM search planner output and execution plan steps.
// Used to validate LLM output before it propagates into the retrieval pipeline.

"use strict";

const { z } = require("zod");

/**
 * A single refined search term from the LLM.
 * Must be a non-empty string of at most 500 characters.
 */
const SearchTermSchema = z.string().min(1).max(500);

/**
 * The full search plan produced by the LLM — an array of 1–10 search terms.
 */
const SearchPlanSchema = z.array(SearchTermSchema).min(1).max(10);

/**
 * A single step passed to executePlan() / runSteps().
 */
const PlanStepSchema = z.object({
  query: z.string().min(1, "Plan step query must not be empty"),
  method: z.enum(["knn", "bm25", "hybrid"]).default("hybrid"),
  top_k: z.number().int().positive().optional(),
});

/**
 * A full execution plan — array of one or more PlanStepSchema objects.
 */
const ExecutionPlanSchema = z.array(PlanStepSchema).min(1);

module.exports = {
  SearchTermSchema,
  SearchPlanSchema,
  PlanStepSchema,
  ExecutionPlanSchema,
};
