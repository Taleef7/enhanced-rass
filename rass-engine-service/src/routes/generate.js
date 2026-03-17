// rass-engine-service/src/routes/generate.js
// POST /generate — Prompt-only generation endpoint used by internal services.

"use strict";

const express = require("express");
const { z } = require("zod");
const { generateFromPrompt } = require("../generation/generator");
const logger = require("../logger");

const router = express.Router();

const GenerateBodySchema = z.object({
  prompt: z.string().min(1, "prompt must not be empty"),
  temperature: z.number().min(0).max(2).optional(),
  max_tokens: z.number().int().positive().max(4000).optional(),
});

router.post("/generate", async (req, res) => {
  const parse = GenerateBodySchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({
      error: "Invalid generation payload",
      details: parse.error.issues,
    });
  }

  try {
    const { prompt, temperature, max_tokens } = parse.data;
    const text = await generateFromPrompt(prompt, {
      temperature,
      maxTokens: max_tokens,
    });
    return res.json({ text });
  } catch (err) {
    logger.error("[API /generate] Endpoint error:", err);
    return res
      .status(500)
      .json({ error: err.message || "Error generating response." });
  }
});

module.exports = router;
