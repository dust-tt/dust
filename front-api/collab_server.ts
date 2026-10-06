// The live session server: one Hocuspocus instance holding open documents in memory, next to a
// Hono app for plain HTTP. Design: x/daph/co-edition/LIVE_SESSION.md.
import "./lib/startup-log";

import type { LiveFile } from "@app/lib/api/co_edition/live_file";
import {
  loadLiveDocument,
  openLiveFile,
  parseLiveDocumentName,
} from "@app/lib/api/co_edition/live_file";
import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import { normalizeError } from "@app/types/shared/utils/error_utils";
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

/** Logs why a connection or a load is refused, then rejects it the way Hocuspocus expects. */
function refuse(documentName: string, reason: string): never {
  logger.warn({ documentName, reason }, "Collab connection refused");
  throw new Error(reason);
}

// Each document's Yjs state, kept across unloads so a reconnecting browser merges into the same
// identities instead of a rebuilt copy. In memory only: durable storage comes with step 8.
const storedStates = new Map<string, Uint8Array>();

/**
 * @cc [owner:PopDaph,label:error-handling] hocuspocus-hook-protocol
 * These hooks follow Hocuspocus's protocol, an exception to `no-catching-own-errors` and
 * `no-parameter-mutation` limited to them: a hook MUST reject a connection or a load by throwing,
 * MUST make a connection read-only by setting `connectionConfig.readOnly`, and `onLoadDocument`
 * MUST destroy the document it was handed when the load fails, since Hocuspocus does not.
 * Hocuspocus swallows what the hooks throw, so every refusal and failure MUST be logged first,
 * without the token.
 */
const hocuspocus = new Hocuspocus<LiveFile>({
  // Dev token: the user id. The document name carries the workspace and the file.
  async onAuthenticate({ documentName, token, connectionConfig }) {
    const parsed = parseLiveDocumentName(documentName);
    if (!parsed) {
      refuse(documentName, "Invalid document name.");
    }
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      token,
      parsed.workspaceId
    );
    if (!auth.isUser()) {
      refuse(documentName, "Not a member of this workspace.");
    }

    const file = await openLiveFile(auth, parsed.canonicalPath);
    if (file.isErr()) {
      refuse(documentName, file.error);
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

    const live = await loadLiveDocument(context).catch((err: unknown) => {
      document.destroy();
      logger.error(
        { err: normalizeError(err), documentName },
        "Collab document load failed"
      );
      throw err;
    });
    if (live.isErr()) {
      document.destroy();
      refuse(documentName, live.error);
    }
    return live.value.doc;
  },

  async onStoreDocument({ documentName, document }) {
    storedStates.set(documentName, Y.encodeStateAsUpdate(document));
  },
});

const app = createHono();
app.route("/api/healthz", healthzApp);

// crossws turns HTTP upgrades into WebSockets and hands them to Hocuspocus, as Hocuspocus's own
// server does, so Hono and Hocuspocus share one HTTP server and one port.
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
