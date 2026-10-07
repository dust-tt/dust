import type { LiveCheckpoint, LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkpointLiveDocument,
  loadLiveDocument,
  openLiveFile,
} from "@app/lib/api/collab/live_file";
import { redeemLiveTicket } from "@app/lib/api/collab/tickets";
import { Authenticator } from "@app/lib/auth";
import type { DfmComment } from "@app/lib/markdown/dfm";
import logger from "@app/logger/logger";
import { parseLiveDocumentName } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Document } from "@hocuspocus/server";
import { Hocuspocus } from "@hocuspocus/server";

export const UNLOAD_GRACE_PERIOD_MS = 5 * 60 * 1000;

/** What a loaded document needs beside its Yjs state to be checkpointed. */
interface LiveSession {
  comments: DfmComment[];
  checkpoint: LiveCheckpoint;
  checkpointFailed: boolean;
  lastChangedBy: LiveFile | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
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
 * @cc [owner:PopDaph,label:security] live-connection-auth
 * A connection MUST open only with a ticket redeemed for the workspace and the file its document
 * name carries, for a user still a member of that workspace, and for a file `openLiveFile` still
 * opens for them.
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
  if (!auth.isUser()) {
    return new Err("Not a member of this workspace.");
  }
  const file = await openLiveFile(auth, parsed.canonicalPath);
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
 * checkpoint the document with the threads and checkpoint of its load, through the connection that
 * last changed it, and MUST fail when that connection cannot write or the checkpoint fails, so
 * Hocuspocus keeps the document instead of unloading it. Once its last WebSocket client leaves,
 * the document MUST stay loaded for `UNLOAD_GRACE_PERIOD_MS` after that departure, then unload
 * unless a connection is open or its last checkpoint failed. A direct connection that leaves
 * during that period does not extend it.
 */
export function createCollabHocuspocus(): Hocuspocus<LiveFile> {
  const sessions = new WeakMap<Document, LiveSession>();

  return new Hocuspocus<LiveFile>({
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
  });
}
