import type { LiveFile } from "@app/lib/api/co_edition/live_file";
import {
  loadLiveDocument,
  openLiveFile,
  parseLiveDocumentName,
} from "@app/lib/api/co_edition/live_file";
import { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { Hocuspocus } from "@hocuspocus/server";
import * as Y from "yjs";

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
 * `no-parameter-mutation` limited to them: a hook MUST reject a connection or a load by throwing,
 * MUST make a connection read-only by setting `connectionConfig.readOnly`, and `onLoadDocument`
 * MUST destroy the document it was handed when the load fails, since Hocuspocus does not.
 * Hocuspocus swallows what the hooks throw, so every refusal and failure MUST be logged first,
 * without the token.
 */
export function createCollabHocuspocus(): Hocuspocus<LiveFile> {
  // Each document's Yjs state, kept across unloads so a reconnecting browser merges into the
  // same identities instead of a rebuilt copy. In memory only: durable storage comes with step 8.
  const storedStates = new Map<string, Uint8Array>();

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

    // Comment threads are not served yet; they come with the session's comment commands.
    async onLoadDocument({ context, document, documentName }) {
      const stored = storedStates.get(documentName);
      if (stored) {
        return stored;
      }

      const live = await loadLiveDocument(context).catch((err: unknown) => {
        document.destroy();
        return logUnexpected(documentName, "Collab document load failed")(err);
      });
      if (live.isErr()) {
        document.destroy();
        refuse(documentName, live.error);
      }
      // Cached now, not only once edited: Hocuspocus unloads an unedited document without storing
      // it, and rebuilding it from the file would give a reconnecting client new identities.
      storedStates.set(documentName, Y.encodeStateAsUpdate(live.value.doc));
      return live.value.doc;
    },

    async onStoreDocument({ documentName, document }) {
      storedStates.set(documentName, Y.encodeStateAsUpdate(document));
    },
  });
}
