// mcp-server/src/schemas/index.js
// Barrel export for all Zod schemas in the mcp-server.

"use strict";

const { ConfigSchema } = require("./configSchema");
const { EmbedUploadSchema } = require("./embedUploadSchema");
const { StreamAskBodySchema } = require("./streamAskSchema");
const { ChatCompletionsBodySchema } = require("./chatCompletionsSchema");
const { UserDocumentsQuerySchema } = require("./userDocumentsSchema");

module.exports = {
  ConfigSchema,
  EmbedUploadSchema,
  StreamAskBodySchema,
  ChatCompletionsBodySchema,
  UserDocumentsQuerySchema,
};
