import { applyLiveCommentCommand } from "@app/lib/api/collab/live_comments";
import type { LiveCheckpoint, LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkLiveAccess,
  checkpointLiveDocument,
  loadLiveDocument,
} from "@app/lib/api/collab/live_file";
import { redeemLiveTicket } from "@app/lib/api/collab/tickets";
import { Authenticator } from "@app/lib/auth";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LiveCommentServerMessage } from "@app/types/collab";
import {
  liveCommentClientMessageSchema,
  parseLiveDocumentName,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { Document } from "@hocuspocus/server";
import { Hocuspocus } from "@hocuspocus/server";
import { z } from "zod";

export const UNLOAD_GRACE_PERIOD_MS = 5 * 60 * 1000;

/** What a loaded document needs beside its Yjs state to be checkpointed. */
interface LiveSession {
  comments: DfmComment[];
  checkpoint: LiveCheckpoint;
  checkpointFailed: boolean;
  lastChangedBy: LiveFile | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
  commentCommands: Promise<void>;
}

const serverMessage = (message: LiveCommentServerMessage) =>
  JSON.stringify(message);

const unavailableResult = (requestId: string) =>
  serverMessage({
    type: "result",
    requestId,
    error: "unavailable",
    comment: null,
  });

const commandRequestSchema = z.object({
  type: z.literal("command"),
  requestId: z.string().min(1),
});

/** Logs why a connection or a load is refused, then rejects it the way Hocuspocus expects. */
function refuse(documentName: string, reason: string): never {
  logger.warn({ documentName, reason }, "Collab connection refused");
  throw new Error(reason);
}

/** Logs an unexpected failure, which Hocuspocus would swallow, then rethrows it. */
function logUnexpected(
  { documentName, workspaceId }: { documentName: string; workspaceId: string },
  message: string
) {
  return (err: unknown): never => {
    logger.error(
      { err: normalizeError(err), documentName, workspaceId },
      message
    );
    throw err;
  };
}

/**
 * @cc [owner:PopDaph,label:security] live-connection-auth
 * A connection MUST open only with a ticket redeemed for the workspace and the file its document
 * name carries, and only if `checkLiveAccess` still lets the ticket's user open that file.
 */
export async function authenticateConnection(
  parsed: { workspaceId: string; canonicalPath: string },
  token: string
): Promise<Result<LiveFile, string>> {
  const ticket = await redeemLiveTicket(token);
  if (
    !ticket ||
    ticket.workspaceId !== parsed.workspaceId ||
    ticket.canonicalPath !== parsed.canonicalPath
  ) {
    return new Err("Invalid or expired ticket.");
  }
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    ticket.userId,
    parsed.workspaceId
  );
  const file = await checkLiveAccess(auth, parsed.canonicalPath);
  if (file.isErr()) {
    return new Err(file.error.message);
  }
  return new Ok(file.value);
}

/**
 * @cc [owner:PopDaph,label:error-handling] hocuspocus-hook-protocol
 * These hooks follow Hocuspocus's protocol, an exception to `no-catching-own-errors` and
 * `no-parameter-mutation` limited to them: a hook MUST reject a connection, a load or a store by
 * throwing, MUST make a connection read-only by setting `connectionConfig.readOnly`, and
 * `onLoadDocument` MUST destroy the document it was handed when the load fails, since Hocuspocus
 * does not. Hocuspocus swallows what the hooks throw, so every refusal and failure MUST be logged
 * first, without the token.
 */
/**
 * @cc [owner:tdraier,label:product;concurrency] collab-document-lifecycle
 * Every load MUST read the file: no Yjs state outlives its Hocuspocus document. A store MUST
 * checkpoint the document with the session's threads and last checkpoint, through the connection
 * that last changed it, and MUST fail when that connection cannot write or the checkpoint fails, so
 * Hocuspocus keeps the document instead of unloading it. Once its last WebSocket client leaves,
 * the document MUST stay loaded for `UNLOAD_GRACE_PERIOD_MS` after that departure, then unload
 * unless a connection is open or its last checkpoint failed. A direct connection that leaves
 * during that period does not extend it.
 */
/**
 * @cc [owner:tdraier,label:security;product] collab-comment-threads
 * A connection MUST receive the session's threads when it asks. A comment command MUST be applied
 * with `applyLiveCommentCommand` for the connection's own file, one at a time per document, and
 * answered to that connection only. Once accepted, the new threads MUST be sent to every
 * connection of the document and the document stored through that connection, so the checkpoint
 * writes them. A command its document unloaded before it finished MUST change nothing. Every
 * command carrying a request id MUST be answered, as `unavailable` when it is invalid, failed or
 * outlived its document, and a failing command MUST NOT stop the later ones. Any other message
 * that is not a valid client message MUST be ignored.
 */
export function createCollabHocuspocus(): Hocuspocus<LiveFile> {
  const sessions = new WeakMap<Document, LiveSession>();

  const hocuspocus = new Hocuspocus<LiveFile>({
    // The token is a ticket minted by front-api for this user, workspace and file.
    async onAuthenticate({ documentName, token, connectionConfig }) {
      const parsed = parseLiveDocumentName(documentName);
      if (!parsed) {
        refuse(documentName, "Invalid document name.");
      }
      const file = await authenticateConnection(parsed, token).catch(
        logUnexpected(
          { documentName, workspaceId: parsed.workspaceId },
          "Collab authentication failed"
        )
      );
      if (file.isErr()) {
        refuse(documentName, file.error);
      }
      connectionConfig.readOnly = !file.value.canWrite;
      return file.value;
    },

    async onLoadDocument({ context, document, documentName }) {
      let loaded: Awaited<ReturnType<typeof loadLiveDocument>>;
      try {
        loaded = await loadLiveDocument(context);
      } catch (err) {
        document.destroy();
        return logUnexpected(
          { documentName, workspaceId: context.workspaceId },
          "Collab document load failed"
        )(err);
      }
      if (loaded.isErr()) {
        document.destroy();
        refuse(documentName, loaded.error);
      }
      const { live, checkpoint } = loaded.value;
      sessions.set(document, {
        comments: live.comments,
        checkpoint,
        checkpointFailed: false,
        lastChangedBy: undefined,
        graceTimer: undefined,
        commentCommands: Promise.resolve(),
      });
      return live.doc;
    },

    async onChange({ document, context }) {
      const session = sessions.get(document);
      if (session) {
        session.lastChangedBy = context;
      }
    },

    // TODO(co-edition): this writes the `.md` on every debounced store, about every 2 to 10 seconds
    // while people type. LIVE_SESSION.md keeps the Yjs state in a durable store between
    // checkpoints instead, since each write is a new file revision that agents' conditional
    // writes conflict with.
    async onStoreDocument({ document, documentName }) {
      const session = sessions.get(document);
      // Not `lastContext`: a direct connection's disconnect stores the document with its own
      // context, even when it changed nothing.
      const writer = session?.lastChangedBy;
      if (!session || !writer) {
        return;
      }
      if (writer.canWrite !== true) {
        session.checkpointFailed = true;
        logger.error(
          { documentName, workspaceId: writer.workspaceId },
          "Collab document changed without a writer"
        );
        throw new Error("The document was changed without a writer.");
      }

      let checkpoint: Result<LiveCheckpoint, string>;
      try {
        checkpoint = await checkpointLiveDocument(
          writer,
          { doc: document, comments: session.comments },
          session.checkpoint
        );
      } catch (err) {
        session.checkpointFailed = true;
        return logUnexpected(
          { documentName, workspaceId: writer.workspaceId },
          "Collab checkpoint failed"
        )(err);
      }
      if (checkpoint.isErr()) {
        // TODO(co-edition): a revision conflict never recovers. `session.checkpoint` only moves on
        // success, so once another writer changes the file every later checkpoint conflicts too,
        // the document stays loaded and its edits never reach the file.
        session.checkpointFailed = true;
        logger.error(
          {
            documentName,
            workspaceId: writer.workspaceId,
            reason: checkpoint.error,
          },
          "Collab checkpoint failed"
        );
        throw new Error(checkpoint.error);
      }
      session.checkpoint = checkpoint.value;
      session.checkpointFailed = false;
    },

    async onDisconnect({ instance, document }) {
      const session = sessions.get(document);
      if (!session || document.getConnections().length > 0) {
        return;
      }
      // Holding the document as a direct connection keeps Hocuspocus from unloading it.
      // TODO(co-edition): the hold inflates the connection counts Hocuspocus reports, and a store
      // that finishes between the last connection's removal and this hook unloads the document
      // with no grace period. Vetoing the unload from `beforeUnloadDocument` until the period ends
      // would cover every unload path.
      if (session.graceTimer === undefined) {
        document.addDirectConnection();
      }
      clearTimeout(session.graceTimer);
      session.graceTimer = setTimeout(() => {
        session.graceTimer = undefined;
        document.removeDirectConnection();
        // Unloading would drop the edits the file does not have.
        // TODO(co-edition): retry the failed checkpoint; until the next edit, its edits only live
        // in memory.
        if (!session.checkpointFailed) {
          void instance.unloadDocument(document);
        }
      }, UNLOAD_GRACE_PERIOD_MS);
    },

    async onStateless({ connection, document, documentName, payload }) {
      const session = sessions.get(document);
      const json = safeParseJSON(payload);
      const message = json.isOk()
        ? liveCommentClientMessageSchema.safeParse(json.value)
        : null;
      if (!session || !message?.success) {
        // TODO(co-edition): log the connection's `workspaceId`.
        logger.warn({ documentName }, "Collab stateless message ignored");
        const request = json.isOk()
          ? commandRequestSchema.safeParse(json.value)
          : null;
        if (request?.success) {
          connection.sendStateless(unavailableResult(request.data.requestId));
        }
        return;
      }
      if (message.data.type === "threads") {
        connection.sendStateless(
          serverMessage({ type: "threads", comments: session.comments })
        );
        return;
      }

      const { requestId, command } = message.data;
      const file: LiveFile = connection.context;
      const logFailure = (err: unknown) =>
        logger.error(
          {
            err: normalizeError(err),
            documentName,
            workspaceId: file.workspaceId,
          },
          "Collab comment command failed"
        );
      const run = async () => {
        let result: Awaited<ReturnType<typeof applyLiveCommentCommand>>;
        try {
          result = await applyLiveCommentCommand(
            file,
            session.comments,
            command
          );
        } catch (err) {
          logFailure(err);
          result = new Err("unavailable");
        }
        // Unloaded while the command waited or ran: a reload reads the file into a new document,
        // and storing this one would cancel that document's debounced store, keyed by name.
        if (document.isDestroyed) {
          connection.sendStateless(unavailableResult(requestId));
          return;
        }
        if (result.isErr()) {
          connection.sendStateless(
            serverMessage({
              type: "result",
              requestId,
              error: result.error,
              comment: null,
            })
          );
          return;
        }

        // TODO(co-edition): refuse commands while `session.checkpointFailed`: an accepted comment
        // only lives in memory until a checkpoint succeeds, and is lost if none ever does.
        // TODO(co-edition): a command still applies after its sender left, whose channel already
        // answered it `unavailable`; a retried `add` then makes a second thread.
        session.comments = result.value.comments;
        session.lastChangedBy = file;
        // TODO(co-edition): broadcast only the changed thread rather than every thread to every
        // connection.
        document.broadcastStateless(
          serverMessage({ type: "threads", comments: session.comments })
        );
        connection.sendStateless(
          serverMessage({
            type: "result",
            requestId,
            error: null,
            comment: result.value.created,
          })
        );
        void hocuspocus.storeDocumentHooks(document, {
          clientsCount: document.getConnectionsCount(),
          document,
          documentName,
          instance: hocuspocus,
          lastContext: file,
          lastTransactionOrigin: undefined,
        });
      };
      session.commentCommands = session.commentCommands
        .then(run)
        .catch(logFailure);
    },
  });

  return hocuspocus;
}

/**
 * @cc [owner:PopDaph,label:product;concurrency] collab-shutdown-checkpoint
 * Once no connection can send edits any more, every document MUST be checkpointed at once, in
 * place of its pending debounced store, including documents still loading, which are waited for
 * first. The returned promise MUST resolve only once each checkpoint has finished or failed.
 */
export async function checkpointAllDocuments(
  hocuspocus: Hocuspocus<LiveFile>
): Promise<void> {
  // A load may still apply edits queued while it ran; its failure was already logged.
  for (const loading of [...hocuspocus.loadingDocuments.values()]) {
    await loading.catch(() => undefined);
  }
  await concurrentExecutor(
    [...hocuspocus.documents.values()],
    (document) =>
      hocuspocus.storeDocumentHooks(
        document,
        {
          clientsCount: document.getConnectionsCount(),
          document,
          documentName: document.name,
          instance: hocuspocus,
          // The store hook checkpoints through the last writer it recorded, not this context.
          lastContext: undefined,
          lastTransactionOrigin: undefined,
        },
        true
      ),
    { concurrency: 8 }
  );
}
