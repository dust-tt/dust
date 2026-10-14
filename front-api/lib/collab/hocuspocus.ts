import type { CollabAccess } from "@app/lib/api/collab/access";
import {
  applyCommentRequest,
  dispatchSessionCommentMentions,
} from "@app/lib/api/collab/comments";
import type { CollabSave } from "@app/lib/api/collab/session_file";
import {
  loadCollabSession,
  saveCollabSession,
} from "@app/lib/api/collab/session_file";
import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

import type { CommentRequestErrorCode } from "@app/types/collab";
import {
  commentClientMessageSchema,
  isDefaultSaveState,
  parseSessionName,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import { authenticateConnection } from "@front-api/lib/collab/connection_access";
import {
  getSession,
  recordSaveResult,
  saveStateMessage,
  toSaveState,
  serverMessage,
  startSession,
  stopWrites,
} from "@front-api/lib/collab/session";
import { Hocuspocus } from "@hocuspocus/server";

import { z } from "zod";

export const UNLOAD_GRACE_PERIOD_MS = 5 * 60 * 1000;
const COMMENT_COMMAND_TIMEOUT_MS = 30 * 1000;
// Each store serializes and uploads the whole `.md`, its only durable copy for now: a crash loses up
// to `STORE_MAX_DEBOUNCE_MS` plus `STORE_DEBOUNCE_MS` of edits; a shutdown saves them first.
const STORE_DEBOUNCE_MS = 5 * 1000;
const STORE_MAX_DEBOUNCE_MS = 30 * 1000;

const refusedMessage = (requestId: string, error: CommentRequestErrorCode) =>
  serverMessage({ type: "refused", requestId, error });

type CommandResult = Awaited<ReturnType<typeof applyCommentRequest>>;

const commandRequestSchema = z.object({
  type: z.literal("command"),
  requestId: z.string().min(1),
});

/** A save failure is an error once, then each retry that fails again only a warning. */
function logSaveFailure(
  retries: number,
  fields: Record<string, unknown>,
  message: string
): void {
  if (retries === 0) {
    logger.error({ ...fields, retries }, message);
  } else {
    logger.warn({ ...fields, retries }, message);
  }
}

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
 * save the document with the session's threads and last save, through the connection
 * that last changed it, and MUST fail when that connection cannot write or the save fails, so
 * Hocuspocus keeps the document instead of unloading it. Once its last WebSocket client leaves,
 * the document MUST stay loaded for `UNLOAD_GRACE_PERIOD_MS` after that departure, then unload
 * unless a connection is open or its last save failed. A direct connection that leaves
 * during that period does not extend it. A failed save MUST be retried after
 * `SAVE_RETRY_DELAY_MS`, the delay doubling with each retry up to `SAVE_RETRY_MAX_DELAY_MS`, until
 * one succeeds, the document unloads or `saveAllSessions` is called, except a save whose writer
 * cannot write, which only another edit fixes. Every time the session's save state
 * (`toSaveState`) changes, every connection MUST be sent it as `save_state`, and a connection
 * opening while it differs from `DEFAULT_SAVE_STATE` MUST be sent it once connected.
 */
/**
 * @cc [owner:tdraier,label:security;product] collab-comment-threads
 * A connection MUST receive the session's threads when it asks. A comment command MUST be applied
 * with `applyCommentRequest` for the connection's own file, one at a time per document, and
 * answered to that connection only. Once accepted, the new threads MUST be sent to every
 * connection of the document and the document stored, so the save writes them, through the
 * connection that last changed its text, or through the latest commenter's when none did, and the
 * message it added handed to `dispatchSessionCommentMentions` without waiting for it. A command its
 * document unloaded before it finished MUST change nothing. Every command carrying a request id
 * MUST be answered, refused as `unavailable` when it is invalid, failed, outlived its document,
 * found the document's last save failed at its turn, or did not finish within
 * `COMMENT_COMMAND_TIMEOUT_MS`, and a failing or late command MUST NOT hold the later ones. Any
 * other message that is not a valid client message MUST be ignored.
 */
export function createCollabHocuspocus(): Hocuspocus<CollabAccess> {
  const hocuspocus = new Hocuspocus<CollabAccess>({
    debounce: STORE_DEBOUNCE_MS,
    maxDebounce: STORE_MAX_DEBOUNCE_MS,

    // The token is a ticket minted by front-api for this user, workspace and file.
    async onAuthenticate({ documentName, token, connectionConfig }) {
      const parsed = parseSessionName(documentName);
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
      let loaded: Awaited<ReturnType<typeof loadCollabSession>>;
      try {
        loaded = await loadCollabSession(context);
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
      const { content, lastSave } = loaded.value;
      startSession(document, {
        comments: content.comments,
        lastSave,
        saveFailed: false,
        saveRetryTimer: undefined,
        saveRetries: 0,
        lastChangedBy: undefined,
        lastCommenter: undefined,
        graceTimer: undefined,
        pendingMutations: Promise.resolve(),
      });
      return content.doc;
    },

    async onChange({ document, context }) {
      const session = getSession(document);
      if (session) {
        session.lastChangedBy = context;
      }
    },

    // TODO(co-edition): this writes the `.md` on every debounced store, about every 5 to 30 seconds
    // while people type. LIVE_SESSION.md keeps the Yjs state in a durable store between
    // saves instead, since each write is a new file revision that agents' conditional
    // writes conflict with.
    async onStoreDocument({ document, documentName, instance }) {
      const session = getSession(document);
      // Not `lastContext`: a direct connection's disconnect stores the document with its own
      // context, even when it changed nothing.
      const writer = session?.lastChangedBy ?? session?.lastCommenter;
      if (!session || !writer) {
        return;
      }
      if (writer.canWrite !== true) {
        logSaveFailure(
          session.saveRetries,
          { documentName, workspaceId: writer.workspaceId },
          "Collab document changed without a writer"
        );
        // A retry would save through the same writer: only an edit from one who can write fixes it.
        recordSaveResult(instance, document, "failed_until_edited");
        throw new Error("The document was changed without a writer.");
      }

      let saved: Result<CollabSave, string>;
      try {
        saved = await saveCollabSession(
          writer,
          { doc: document, comments: session.comments },
          session.lastSave
        );
      } catch (err) {
        logSaveFailure(
          session.saveRetries,
          {
            err: normalizeError(err),
            documentName,
            workspaceId: writer.workspaceId,
          },
          "Collab save failed"
        );
        recordSaveResult(instance, document, "failed");
        throw err;
      }
      if (saved.isErr()) {
        // TODO(co-edition): a revision conflict never recovers. `session.lastSave` only moves on
        // success, so once another writer changes the file every later save conflicts too,
        // the document stays loaded and its edits never reach the file.
        logSaveFailure(
          session.saveRetries,
          {
            documentName,
            workspaceId: writer.workspaceId,
            reason: saved.error,
          },
          "Collab save failed"
        );
        recordSaveResult(instance, document, "failed");
        throw new Error(saved.error);
      }
      session.lastSave = saved.value;
      recordSaveResult(instance, document, "saved");
    },

    async onDisconnect({ instance, document }) {
      const session = getSession(document);
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
        // Unloading would drop the edits the file does not have. The retried save unloads it once
        // it succeeds, with no grace period left.
        if (!session.saveFailed) {
          void instance.unloadDocument(document);
        }
      }, UNLOAD_GRACE_PERIOD_MS);
    },

    // A connection joining while saves fail learns it here, the others when it changes.
    async connected({ connection }) {
      const session = getSession(connection.document);
      const state = session && toSaveState(session);
      if (state && !isDefaultSaveState(state)) {
        connection.sendStateless(saveStateMessage(state));
      }
    },

    async onStateless({ connection, document, documentName, payload }) {
      const session = getSession(document);
      const file: CollabAccess = connection.context;
      const json = safeParseJSON(payload);
      const message = json.isOk()
        ? commentClientMessageSchema.safeParse(json.value)
        : null;
      if (!session || !message?.success) {
        logger.info(
          { documentName, workspaceId: file.workspaceId },
          "Collab stateless message ignored"
        );
        const request = json.isOk()
          ? commandRequestSchema.safeParse(json.value)
          : null;
        if (request?.success) {
          connection.sendStateless(
            refusedMessage(request.data.requestId, "unavailable")
          );
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
      const logFailure = (err: unknown) =>
        logger.error(
          {
            err: normalizeError(err),
            documentName,
            workspaceId: file.workspaceId,
          },
          "Collab comment command failed"
        );
      const apply = async (): Promise<CommandResult> => {
        try {
          const applied = await Promise.race([
            applyCommentRequest(file, session.comments, command),
            setTimeoutAsync(COMMENT_COMMAND_TIMEOUT_MS),
          ]);
          if (applied === "timeout") {
            logger.error(
              { documentName, workspaceId: file.workspaceId },
              "Collab comment command timed out"
            );
            return new Err("unavailable");
          }
          return applied;
        } catch (err) {
          logFailure(err);
          return new Err("unavailable");
        }
      };
      const run = async () => {
        // Unloaded while the command waited or ran: a reload reads the file into a new document,
        // and storing this one would cancel that document's debounced store, keyed by name.
        // While saves fail, an accepted comment would only live in memory.
        const result: CommandResult =
          document.isDestroyed || session.saveFailed
            ? new Err("unavailable")
            : await apply();
        if (document.isDestroyed || result.isErr()) {
          connection.sendStateless(
            refusedMessage(
              requestId,
              result.isErr() ? result.error : "unavailable"
            )
          );
          return;
        }

        // TODO(co-edition): a command still applies after its sender left, whose channel already
        // answered it `unavailable`; a retried `add` then makes a second thread.
        session.comments = result.value.comments;
        // Every accepted command changes the threads.
        session.lastCommenter = file;
        // TODO(co-edition): broadcast only the changed thread rather than every thread to every
        // connection.
        document.broadcastStateless(
          serverMessage({ type: "threads", comments: session.comments })
        );
        connection.sendStateless(
          serverMessage({
            type: "accepted",
            requestId,
            comment: result.value.created,
          })
        );
        // Not awaited: Hocuspocus debounces the store and catches its failures, which
        // `onStoreDocument` logs.
        void hocuspocus.storeDocumentHooks(document, {
          clientsCount: document.getConnectionsCount(),
          document,
          documentName,
          instance: hocuspocus,
          lastContext: file,
          lastTransactionOrigin: undefined,
        });
        if (result.value.added) {
          // Not awaited: the command is answered without waiting for its mentions to be posted.
          void dispatchSessionCommentMentions(
            file,
            document,
            command,
            result.value.added
          ).catch((err) =>
            logger.error(
              {
                err: normalizeError(err),
                documentName,
                workspaceId: file.workspaceId,
              },
              "Collab comment mentions dispatch failed"
            )
          );
        }
      };
      session.pendingMutations = session.pendingMutations
        .then(run)
        .catch(logFailure);
    },
  });

  return hocuspocus;
}

/**
 * @cc [owner:PopDaph,label:product;concurrency] collab-shutdown-save
 * Once no connection can send edits any more, every document MUST be saved at once, in
 * place of its pending debounced store, including documents still loading, which are waited for
 * first. From the call on, `writeSessionSource` MUST answer `busy`, and the writes and comment
 * commands already queued MUST finish before the saves. The returned promise MUST resolve
 * only once each save has finished or failed.
 */
export async function saveAllSessions(
  hocuspocus: Hocuspocus<CollabAccess>
): Promise<void> {
  stopWrites(hocuspocus);
  // A load may still apply edits queued while it ran; its failure was already logged.
  for (const loading of [...hocuspocus.loadingDocuments.values()]) {
    await loading.catch(() => undefined);
  }
  // Their writes only reach the file through the saves below.
  await Promise.all(
    [...hocuspocus.documents.values()].map(
      (document) => getSession(document)?.pendingMutations
    )
  );
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
          // The store hook saves through the last writer it recorded, not this context.
          lastContext: undefined,
          lastTransactionOrigin: undefined,
        },
        true
      ),
    { concurrency: 8 }
  );
}
