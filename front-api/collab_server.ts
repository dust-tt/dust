// The live session server: one Hocuspocus instance holding open documents in memory, next to a
// Hono app for plain HTTP. Design: x/daph/co-edition/LIVE_SESSION.md.
import "./lib/startup-log";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";
import type { WebSocketLike } from "@hocuspocus/server";
import { serve } from "@hono/node-server";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";

import {
  checkpointAllDocuments,
  createCollabHocuspocus,
} from "./lib/collab/hocuspocus";
import { createHono } from "./lib/hono";
import { healthzApp } from "./routes/healthz";

/**
 * @cc [owner:PopDaph,label:security] collab-server-dev-only
 * Until a connection's access is re-checked during its session, the server MUST refuse to start
 * outside development: access is checked only when a connection opens, so a user removed from a
 * workspace or a file keeps editing until disconnected. This runs before anything else at startup.
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

// The pod is stopped with SIGTERM: take no more connections, then checkpoint every loaded document
// so the edits still waiting for their debounced store reach the file.
async function shutdown(signal: NodeJS.Signals) {
  logger.info(
    { signal, documents: hocuspocus.getDocumentsCount() },
    "Collab server shutting down"
  );
  server.close();
  // Terminating the sockets, not only closing Hocuspocus's connections, so no edit still on the
  // wire arrives during the checkpoints.
  ws.closeAll(1001, "Server shutting down", true);
  await checkpointAllDocuments(hocuspocus);
  logger.info("Collab server stopped");
  process.exit(0);
}

// A second signal while checkpointing must not end the process: it joins the first shutdown.
let stopping: Promise<void> | undefined;
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    stopping ??= shutdown(signal).catch((err: unknown) => {
      logger.error(
        { err: normalizeError(err) },
        "Collab server shutdown failed"
      );
      process.exit(1);
    });
  });
}
