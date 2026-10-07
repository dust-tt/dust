import type { LiveCheckpoint, LiveFile } from "@app/lib/api/collab/live_file";
import {
  checkpointLiveDocument,
  loadLiveDocument,
  openLiveFile,
} from "@app/lib/api/collab/live_file";
import { Authenticator } from "@app/lib/auth";
import type { DfmComment } from "@app/lib/markdown/dfm";
import logger from "@app/logger/logger";
import { parseLiveDocumentName } from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Document } from "@hocuspocus/server";
import { Hocuspocus } from "@hocuspocus/server";

export const UNLOAD_GRACE_PERIOD_MS = 5 * 60 * 1000;

/** What a loaded document needs beside its Yjs state to be checkpointed. */
interface LiveSession {
  comments: DfmComment[];
  checkpoint: LiveCheckpoint;
  checkpointFailed: boolean;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
}

/** Logs why a connection or a load is refused, then rejects it the way Hocuspocus expects. */
function refuse(documentName: string, reason: string): never {
  logger.warn({ documentName, reason }, "Collab connection refused");
  throw new Error(reason);
}

/** Logs an unexpected failure, which Hocuspocus would swallow, then rethrows it. */
function logUnexpected(documentName: string, message: string) {
  return (err: unknown): never => {
    logger.error({ err: normalizeError(err), documentName }, message);
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
 * checkpoint the document with the threads and checkpoint of its load, through the connection that
 * last changed it, and MUST fail when that connection cannot write or the checkpoint fails, so
 * Hocuspocus keeps the document instead of unloading it. Once its last client leaves, the
 * document MUST stay loaded for `UNLOAD_GRACE_PERIOD_MS` after the last departure, then unload
 * unless a client came back or its last checkpoint failed.
 */
export function createCollabHocuspocus(): Hocuspocus<LiveFile> {
  const sessions = new WeakMap<Document, LiveSession>();

  return new Hocuspocus<LiveFile>({
    // Dev token: the user id. The document name carries the workspace and the file.
    async onAuthenticate({ documentName, token, connectionConfig }) {
      const parsed = parseLiveDocumentName(documentName);
      if (!parsed) {
        refuse(documentName, "Invalid document name.");
      }
      const auth = await Authenticator.fromUserIdAndWorkspaceId(
        token,
        parsed.workspaceId
      ).catch(logUnexpected(documentName, "Collab authentication failed"));
      if (!auth.isUser()) {
        refuse(documentName, "Not a member of this workspace.");
      }

      const file = await openLiveFile(auth, parsed.canonicalPath).catch(
        logUnexpected(documentName, "Collab authentication failed")
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
        return logUnexpected(documentName, "Collab document load failed")(err);
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
        graceTimer: undefined,
      });
      return live.doc;
    },

    async onStoreDocument({ document, documentName, lastContext }) {
      const session = sessions.get(document);
      if (!session) {
        return;
      }
      if (lastContext.canWrite !== true) {
        session.checkpointFailed = true;
        logger.error(
          { documentName, workspaceId: lastContext.workspaceId },
          "Collab document changed without a writer"
        );
        throw new Error("The document was changed without a writer.");
      }

      let checkpoint: Result<LiveCheckpoint, string>;
      try {
        checkpoint = await checkpointLiveDocument(
          lastContext,
          { doc: document, comments: session.comments },
          session.checkpoint
        );
      } catch (err) {
        session.checkpointFailed = true;
        return logUnexpected(documentName, "Collab checkpoint failed")(err);
      }
      if (checkpoint.isErr()) {
        session.checkpointFailed = true;
        logger.error(
          {
            documentName,
            workspaceId: lastContext.workspaceId,
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
      if (session.graceTimer === undefined) {
        document.addDirectConnection();
      }
      clearTimeout(session.graceTimer);
      session.graceTimer = setTimeout(() => {
        session.graceTimer = undefined;
        document.removeDirectConnection();
        // Unloading would drop the edits the file does not have.
        if (!session.checkpointFailed) {
          void instance.unloadDocument(document);
        }
      }, UNLOAD_GRACE_PERIOD_MS);
    },
  });
}
