import type { CollabAccess } from "@app/lib/api/collab/access";
import type { CollabSave } from "@app/lib/api/collab/session_file";
import { yDocToDfm } from "@app/lib/api/collab/ydoc";
import type { DfmComment } from "@app/lib/markdown/dfm";
import type { CollabSourceReadResponse } from "@app/types/collab_internal";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Document, Hocuspocus } from "@hocuspocus/server";

/** What front-collab holds for an open file beside its Yjs state, to save it. */
export interface CollabSession {
  comments: DfmComment[];
  checkpoint: CollabSave;
  checkpointFailed: boolean;
  lastChangedBy: CollabAccess | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
  commentCommands: Promise<void>;
}

const sessions = new WeakMap<Document, CollabSession>();
const shuttingDown = new WeakSet<Hocuspocus<CollabAccess>>();

/** The session of a document Hocuspocus has loaded, if any. */
export function getSession(document: Document): CollabSession | undefined {
  return sessions.get(document);
}

/** Starts the session of a document Hocuspocus just loaded. */
export function startSession(document: Document, session: CollabSession): void {
  sessions.set(document, session);
}

/** Refuses every write from front from now on: the server is shutting down. */
export function stopWrites(hocuspocus: Hocuspocus<CollabAccess>): void {
  shuttingDown.add(hocuspocus);
}

export function isStoppingWrites(
  hocuspocus: Hocuspocus<CollabAccess>
): boolean {
  return shuttingDown.has(hocuspocus);
}

/** The document and its session while one is open, once it has finished loading or unloading. */
export async function getLoadedSession(
  hocuspocus: Hocuspocus<CollabAccess>,
  documentName: string
): Promise<{ document: Document; session: CollabSession } | null> {
  // Only their outcome matters, read from `documents` below: a failed load leaves no document, and
  // `onLoadDocument` already logged why.
  await Promise.allSettled([
    hocuspocus.loadingDocuments.get(documentName),
    hocuspocus.unloadingDocuments.get(documentName),
  ]);
  const document = hocuspocus.documents.get(documentName);
  const session = document && sessions.get(document);
  if (!document || document.isDestroyed || !session) {
    return null;
  }
  return { document, session };
}

/**
 * @cc [owner:tdraier,label:product;concurrency] collab-session-source-read
 * A document MUST be reported open while Hocuspocus holds it, after waiting for a load or an
 * unload in progress, with as source what `yDocToDfm` gives for it and the session's threads.
 */
export async function readSessionSource(
  hocuspocus: Hocuspocus<CollabAccess>,
  documentName: string
): Promise<Result<CollabSourceReadResponse, string>> {
  const open = await getLoadedSession(hocuspocus, documentName);
  if (!open) {
    return new Ok({ open: false });
  }
  const source = yDocToDfm({
    doc: open.document,
    comments: open.session.comments,
  });
  if (source.isErr()) {
    return source;
  }
  return new Ok({ open: true, source: source.value });
}
