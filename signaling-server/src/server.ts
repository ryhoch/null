import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { Registry } from "./registry.js";
import { parseMessage } from "./protocol.js";
import { handleMessage } from "./handlers.js";

export function createSignalingServer() {
  const app = express();
  const registry = new Registry();

  // Minimal HTTP surface — one health endpoint, nothing else
  app.get("/health", (_req, res) => {
    res.json({ ok: true, connectedPeers: registry.size() });
  });

  const httpServer = createServer(app);

  const wss = new WebSocketServer({
    server: httpServer,
    // SECURITY: Limit payload size to prevent OOM from malicious large SDP blobs
    maxPayload: 64 * 1024, // 64KB
  });

  wss.on("connection", (socket: WebSocket) => {
    socket.on("message", (raw) => {
      const msg = parseMessage(raw.toString());
      if (msg === null) return; // silently drop invalid messages
      handleMessage(msg, socket, registry);
    });

    socket.on("close", () => {
      registry.removeBySocket(socket);
    });

    socket.on("error", () => {
      registry.removeBySocket(socket);
      socket.terminate();
    });
  });

  return { httpServer, wss, registry };
}
