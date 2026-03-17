// rass-engine-service/src/routes/health.js
// GET /health - lightweight readiness endpoint for the query engine.

"use strict";

const express = require("express");

const router = express.Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
