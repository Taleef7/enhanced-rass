// rass-engine-service/src/schemas/index.js
// Barrel export for all Zod schemas in the rass-engine-service.

"use strict";

const { ConfigSchema } = require("./configSchema");
const { AskBodySchema, StreamAskBodySchema } = require("./askSchema");
const {
  SearchTermSchema,
  SearchPlanSchema,
  PlanStepSchema,
  ExecutionPlanSchema,
} = require("./plannerSchemas");
const {
  RetrievalHitSchema,
  RetrievalResultSchema,
  CitationSchema,
  CitationListSchema,
} = require("./retrievalSchemas");

module.exports = {
  // Config
  ConfigSchema,

  // API request schemas
  AskBodySchema,
  StreamAskBodySchema,

  // Planner schemas
  SearchTermSchema,
  SearchPlanSchema,
  PlanStepSchema,
  ExecutionPlanSchema,

  // Retrieval schemas
  RetrievalHitSchema,
  RetrievalResultSchema,
  CitationSchema,
  CitationListSchema,
};
