// mcp-server/src/schemas/chatCompletionsSchema.js
// Zod schema for the POST /api/chat/completions endpoint body (OpenAI-compatible format).

"use strict";

const { z } = require("zod");

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.union([
    z.string(),
    z.array(
      z.object({
        type: z.string(),
        text: z.string().optional(),
      })
    ),
  ]),
});

const ChatCompletionsBodySchema = z
  .object({
    messages: z
      .array(MessageSchema)
      .min(1, "messages must contain at least one message"),
    model: z.string().optional(),
    stream: z.boolean().optional(),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.messages.length === 0) return; // min(1) already handles this
    const lastMsg = data.messages[data.messages.length - 1];
    if (lastMsg.role !== "user") {
      ctx.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Last message must have role 'user'",
      });
    }
  });

module.exports = { ChatCompletionsBodySchema };
