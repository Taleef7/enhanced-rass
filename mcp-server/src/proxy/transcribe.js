// mcp-server/src/proxy/transcribe.js
// POST /api/transcribe — Transcribes an audio file using OpenAI Whisper.

const express = require("express");
const multer = require("multer");
const { OpenAI } = require("openai");
const { toFile } = require("openai/uploads");
const authMiddleware = require("../authMiddleware");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const router = express.Router();

router.post(
  "/api/transcribe",
  authMiddleware,
  upload.single("audio"),
  async (req, res) => {
    try {
      if (!openai) {
        return res.status(503).json({
          error: "Transcription service unavailable (no OPENAI_API_KEY).",
        });
      }
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided." });
      }

      const filename = req.file.originalname || "recording.webm";
      const file = await toFile(req.file.buffer, filename, {
        type: req.file.mimetype || "audio/webm",
      });

      const response = await openai.audio.transcriptions.create({
        file,
        model: "whisper-1",
        response_format: "json",
        temperature: 0,
      });

      return res.json({ text: response.text || "" });
    } catch (e) {
      console.error("[Transcribe] Error:", e);
      return res
        .status(500)
        .json({ error: "Transcription failed.", details: e.message });
    }
  }
);

module.exports = router;
