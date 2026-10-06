// The live session server: one Hocuspocus instance holding open documents in memory, next to a
// Hono app for plain HTTP. Design: x/daph/co-edition/LIVE_SESSION.md.
import "./lib/startup-log";

import type { LiveFile } from "@app/lib/api/co_edition/live_file";
import {
  loadLiveDocument,
  openLiveFile,
  parseLiveDocumentName,
} from "@app/lib/api/co_edition/live_file";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { setupGlobalErrorHandler } from "@app/types/shared/utils/global_error_handler";
import type { WebSocketLike } from "@hocuspocus/server";
import { Hocuspocus } from "@hocuspocus/server";
import { serve } from "@hono/node-server";
import type { Peer } from "crossws";
import crossws from "crossws/adapters/node";
import * as Y from "yjs";

import { createHono } from "./lib/hono";
import { healthzApp } from "./routes/healthz";

/**
 * @cc [owner:PopDaph,label:security] collab-server-dev-only
 * Until connections are authenticated with tickets minted by front-api, the server MUST refuse
 * to start outside development: the dev token is a bare user id.
 */
if (!isDevelopment()) {
  throw new Error("The collab server only runs in development for now.");
}

setupGlobalErrorHandler(logger);

const port = parseInt(process.env.COLLAB_PORT ?? "3010", 10);
const hostname = process.env.HOSTNAME ?? "localhost";

// Each document's Yjs state, kept across unloads so a reconnecting browser merges into the same
// identities instead of a rebuilt copy. In memory only: durable storage comes with step 8.
const storedStates = new Map<string, Uint8Array>();

const hocuspocus = new Hocuspocus<LiveFile>({
  // Dev token: the user id. The document name carries the workspace and the file.
  async onAuthenticate({ documentName, token, connectionConfig }) {
    const parsed = parseLiveDocumentName(documentName);
    if (!parsed) {
      throw new Error("Invalid document name.");
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      token,
      parsed.workspaceId
    );
    if (!auth.isUser()) {
      throw new Error("Not a member of this workspace.");
    }

    const file = await openLiveFile(auth, parsed.canonicalPath);
    if (file.isErr()) {
      throw new Error(file.error);
    }
    connectionConfig.readOnly = !file.value.canWrite;
    return file.value;
  },

  // Comment threads are not served yet; they come with the session's comment commands.
  async onLoadDocument({ context, document, documentName }) {
    const stored = storedStates.get(documentName);
    if (stored) {
      return stored;
    }

    // Hocuspocus does not destroy the document when this hook fails, which leaks its timers.
    try {
      const live = await loadLiveDocument(context);
      if (live.isErr()) {
        throw new Error(live.error);
      }
      return live.value.doc;
    } catch (err) {
      document.destroy();
      throw err;
    }
  },

  async onStoreDocument({ documentName, document }) {
    storedStates.set(documentName, Y.encodeStateAsUpdate(document));
  },
});

const app = createHono();
app.route("/api/healthz", healthzApp);

type ClientConnection = ReturnType<typeof hocuspocus.handleConnection>;
const connections = new WeakMap<Peer, ClientConnection>();

const ws = crossws({
  hooks: {
    open(peer) {
      // crossws types the upgraded socket as a partial WebSocket; Hocuspocus's own server
      // passes the same object.
      connections.set(
        peer,
        hocuspocus.handleConnection(
          peer.websocket as WebSocketLike,
          peer.request
        )
      );
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
