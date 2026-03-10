// rass-engine-service/index.js
// Thin orchestrator: loads modules, registers routes, and starts the server.

const express = require("express");
const { RASS_ENGINE_PORT } = require("./src/config");

const askRoutes = require("./src/routes/ask");
const streamAskRoutes = require("./src/routes/streamAsk");

const app = express();
app.use(express.json());

app.use(askRoutes);
app.use(streamAskRoutes);

async function startServer() {
  app.listen(RASS_ENGINE_PORT, () =>
    console.log(
      `RASS Engine API running on http://localhost:${RASS_ENGINE_PORT}`
    )
  );
}

startServer();
