// mcp-server/src/proxy/embedUpload.js
// POST /api/embed-upload — Proxies an authenticated file upload to the embedding service.

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const multer = require("multer");
const authMiddleware = require("../authMiddleware");

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

router.post(
  "/api/embed-upload",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    console.log(`[Upload Proxy] Received file: ${req.file.originalname}`);

    try {
      const form = new FormData();
      form.append("files", req.file.buffer, {
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });
      form.append("userId", req.user.userId);

      const embeddingServiceUrl = "http://embedding-service:8001/upload";
      const response = await axios.post(embeddingServiceUrl, form, {
        headers: { ...form.getHeaders() },
        timeout: process.env.EMBEDDING_SERVICE_TIMEOUT || 300000,
      });

      console.log(
        "[Upload Proxy] File forwarded to embedding-service successfully."
      );
      res.status(response.status).json(response.data);
    } catch (e) {
      console.error(
        "[Upload Proxy] Error forwarding file to embedding-service:",
        e.message
      );
      res.status(500).json({
        error: "Failed to upload and embed file.",
        details: e.message,
      });
    }
  }
);

module.exports = router;
