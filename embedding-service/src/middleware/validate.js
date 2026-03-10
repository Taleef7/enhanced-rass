// embedding-service/src/middleware/validate.js
// Reusable Zod validation middleware for Express routes.
//
// Usage:
//   const { validateBody, validateQuery } = require('../middleware/validate');
//   router.post('/upload', upload.array('files'), validateBody(UploadBodySchema), handler);

"use strict";

/**
 * Returns Express middleware that validates req.body against the given Zod schema.
 * On success, attaches the parsed (coerced) values to req.validatedBody and calls next().
 * On failure, responds with HTTP 400 and { error, details }.
 *
 * @param {import('zod').ZodTypeAny} schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues,
      });
    }
    req.validatedBody = result.data;
    next();
  };
}

/**
 * Returns Express middleware that validates req.query against the given Zod schema.
 * On success, attaches the parsed (coerced) values to req.validatedQuery and calls next().
 * On failure, responds with HTTP 400 and { error, details }.
 *
 * @param {import('zod').ZodTypeAny} schema
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: result.error.issues,
      });
    }
    req.validatedQuery = result.data;
    next();
  };
}

module.exports = { validateBody, validateQuery };
