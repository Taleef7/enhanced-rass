// embedding-service/src/schemas/index.js
// Barrel export for all Zod schemas in the embedding-service.

"use strict";

const { ConfigSchema } = require("./configSchema");
const { UploadBodySchema } = require("./uploadSchema");

module.exports = {
  ConfigSchema,
  UploadBodySchema,
};
