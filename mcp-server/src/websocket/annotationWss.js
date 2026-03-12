// mcp-server/src/websocket/annotationWss.js
// Phase G #138: WebSocket server for real-time collaborative annotation broadcasts.
//
// Clients connect to ws://host/ws/annotations (or wss:// in production).
// Authentication is done via a token query parameter:
//   ws://host/ws/annotations?token=<JWT>
//
// On connection, clients receive:
//   { event: "connected", data: { userId } }
//
// On annotation changes broadcast:
//   { event: "annotation:create" | "annotation:update" | "annotation:delete", data: {...} }
//
// The server handles automatic reconnection by sending a heartbeat ping every 30s.

"use strict";

const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");
const logger = require("../logger");

let wss = null;
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Attaches the annotation WebSocket server to an existing HTTP server.
 *
 * @param {import('http').Server} httpServer - The Node.js HTTP server.
 * @returns {WebSocketServer}
 */
function attachAnnotationWss(httpServer) {
  wss = new WebSocketServer({
    server: httpServer,
    path: "/ws/annotations",
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        logger.debug("[WS] Terminating idle client");
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, HEARTBEAT_INTERVAL_MS);

  wss.on("close", () => clearInterval(heartbeatInterval));

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;

    // Extract JWT from query string for authentication
    const urlParams = new URLSearchParams((req.url || "").split("?")[1] || "");
    const token = urlParams.get("token");

    let userId = null;
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "change_this_secret");
        userId = decoded.userId || decoded.sub || null;
      } catch {
        logger.warn("[WS] Invalid token — connection allowed but unauthenticated");
      }
    }

    logger.info(`[WS] Annotation client connected (userId=${userId || "anonymous"})`);

    ws.on("pong", () => { ws.isAlive = true; });

    // Acknowledge connection
    ws.send(JSON.stringify({ event: "connected", data: { userId } }));

    ws.on("close", () => {
      logger.debug(`[WS] Annotation client disconnected (userId=${userId || "anonymous"})`);
    });

    ws.on("error", (err) => {
      logger.error("[WS] WebSocket error:", err.message);
    });
  });

  logger.info("[WS] Annotation WebSocket server attached at /ws/annotations");
  return wss;
}

/**
 * Returns the singleton WebSocket server instance.
 * Returns null if attachAnnotationWss has not been called yet.
 */
function getAnnotationWss() {
  return wss;
}

module.exports = { attachAnnotationWss, getAnnotationWss };
