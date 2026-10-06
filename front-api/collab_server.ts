// The live session server: one Hocuspocus instance holding open documents in memory, next to a
// Hono app for plain HTTP. Design: x/daph/co-edition/LIVE_SESSION.md.
import "./lib/startup-log";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";
import type { WebSocketLike } from "@hocuspocus/server";
import { serve } from "@hono/node-server";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";

import { createCollabHocuspocus } from "./lib/collab/hocuspocus";
import { createHono } from "./lib/hono";
import { healthzApp } from "./routes/healthz";

/**
 * @cc [owner:PopDaph,label:security] collab-server-dev-only
 * Until connections are authenticated with tickets minted by front-api, the server MUST refuse
 * to start outside development: the dev token is a bare user id. This runs before anything else
 * at startup.
 */
function assertDevelopmentOnly() {
  if (!isDevelopment()) {
    throw new Error("The collab server only runs in development for now.");
  }
}

assertDevelopmentOnly();
setupGlobalErrorHandler(logger);

const port = config.getCollabServerPort();
const hostname = config.getCollabServerHostname();

const hocuspocus = createCollabHocuspocus();

const app = createHono();
app.route("/api/healthz", healthzApp);

// crossws types the upgraded socket as a partial WebSocket; on Node it is a full `ws` socket.
function isWebSocketLike(socket: unknown): socket is WebSocketLike {
  return (
    typeof socket === "object" &&
    socket !== null &&
    "send" in socket &&
    typeof socket.send === "function" &&
    "close" in socket &&
    typeof socket.close === "function" &&
    "readyState" in socket &&
    typeof socket.readyState === "number"
  );
}

// crossws turns HTTP upgrades into WebSockets and hands them to Hocuspocus, as Hocuspocus's own
// server does, so Hono and Hocuspocus share one HTTP server and one port.
type ClientConnection = ReturnType<typeof hocuspocus.handleConnection>;
const connections = new WeakMap<Peer, ClientConnection>();

const ws = crossws({
  hooks: {
    open(peer) {
      const socket = peer.websocket;
      if (!isWebSocketLike(socket)) {
        logger.error(
          { peerId: peer.id },
          "Collab peer has no usable WebSocket"
        );
        peer.close(1011, "Unsupported connection");
        return;
      }
      connections.set(peer, hocuspocus.handleConnection(socket, peer.request));
    },
    message(peer, message) {
      connections.get(peer)?.handleMessage(message.uint8Array());
    },
    close(peer, event) {
      // 1005: the peer closed without a status code.
      connections.get(peer)?.handleClose({
        code: event.code ?? 1005,
        reason: event.reason ?? "",
      });
      connections.delete(peer);
    },
    error(peer, error) {
      logger.error({ err: error, peerId: peer.id }, "Collab WebSocket error");
    },
  },
});

const server = serve({ fetch: app.fetch, port, hostname }, () => {
  logger.info({ port, hostname }, "Collab server listening");
});
server.on("upgrade", (request, socket, head) => {
  ws.handleUpgrade(request, socket, head);
});
server.on("error", (err) => {
  logger.error({ err }, "Collab server error");
  process.exit(1);
});
