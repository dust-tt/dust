import type { CollabAccess } from "@app/lib/api/collab/access";
import type { CollabSave } from "@app/lib/api/collab/session_file";
import { replaceYDocContent, yDocToDfm } from "@app/lib/api/collab/ydoc";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

import type {
  CollabAgent,
  AgentActivity,
  AgentEditMessage,
  AgentActivityMessage,
  CommentServerMessage,
  InsertedIdRange,
} from "@app/types/collab";
import { BODY_FRAGMENT_NAME, toSessionName } from "@app/types/collab";
import type {
  CollabSourceWriteResult,
  CollabSourceReadResponse,
} from "@app/types/collab_internal";
import { COLLAB_SOURCE_WRITE_WAIT_MS } from "@app/types/collab_internal";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Document, Hocuspocus } from "@hocuspocus/server";
import type * as Y from "yjs";

/** What front-collab holds for an open file beside its Yjs state, to save it. */
export interface CollabSession {
  comments: DfmComment[];
  lastSave: CollabSave;
  saveFailed: boolean;
  /** The connection that last changed the text. */
  lastChangedBy: CollabAccess | undefined;
  /** The connection that last changed the threads, which saves them when nobody changed the text. */
  lastCommenter: CollabAccess | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
  pendingMutations: Promise<void>;
}

export const serverMessage = (message: CommentServerMessage) =>
  JSON.stringify(message);

const agentActivityMessage = (
  agent: CollabAgent,
  activity: AgentActivity
): string =>
  JSON.stringify({
    type: "agent_activity",
    agent,
    activity,
  } satisfies AgentActivityMessage);

/** The Yjs items `transaction` inserted, by id. */
const insertedRanges = (transaction: Y.Transaction): InsertedIdRange[] => {
  const ranges: InsertedIdRange[] = [];
  transaction.afterState.forEach((after, client) => {
    const before = transaction.beforeState.get(client) ?? 0;
    if (after > before) {
      ranges.push({ client, clock: before, length: after - before });
    }
  });
  return ranges;
};

const agentEditMessage = (
  agent: CollabAgent,
  inserted: InsertedIdRange[]
): string =>
  JSON.stringify({
    type: "agent_edit",
    agent,
    inserted,
  } satisfies AgentEditMessage);

const sessions = new WeakMap<Document, CollabSession>();
const writesStopped = new WeakSet<Hocuspocus<CollabAccess>>();

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
  writesStopped.add(hocuspocus);
}

/** Whether `stopWrites` was called for this server. */
export function isStoppingWrites(
  hocuspocus: Hocuspocus<CollabAccess>
): boolean {
  return writesStopped.has(hocuspocus);
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

/**
 * @cc [owner:PopDaph,label:product] collab-agent-activity
 * Every connection of a document Hocuspocus holds MUST be told what `agent` is doing in it, and
 * nothing MUST be sent for a document it does not hold. Callers MUST only report an agent whose
 * user may read the document live (`checkCollabReadAccess`).
 */
export function showAgentActivity(
  hocuspocus: Hocuspocus<CollabAccess>,
  documentName: string,
  agent: CollabAgent,
  activity: AgentActivity
): void {
  const document = hocuspocus.documents.get(documentName);
  if (document && !document.isDestroyed) {
    document.broadcastStateless(agentActivityMessage(agent, activity));
  }
}

/**
 * @cc [owner:tdraier,label:product;concurrency;security] collab-session-source-write
 * A write MUST only target the document named after `file`'s workspace and path, so its save
 * writes the file the document was loaded from. It MUST answer `closed`, changing nothing, when
 * `readSessionSource` would report the document closed, and `changed`, changing nothing, unless the
 * source `readSessionSource` would return is `base`. Otherwise it MUST apply `source` with
 * `replaceYDocContent` as a change from `file`, replace the session's threads with the ones it
 * returns, send them to every connection when they changed, and store the document so the
 * save writes the change; a source the editor refuses MUST fail and change nothing. `file`
 * MUST be able to write, and the session's storage MUST have revisions, since without them its
 * saves could not be conditional; otherwise the write MUST fail and change nothing. It MUST
 * take its turn among the document's comment commands, answering `closed` if the document unloaded
 * meanwhile, and a write that fails MUST NOT hold the later ones. A write whose turn has not come
 * within `COLLAB_SOURCE_WRITE_WAIT_MS` MUST answer `busy` and never apply, so its caller never
 * retries a change that lands later; so MUST a write once `saveAllSessions` was called.
 * Nothing may run between the comparison with `base` and the change, so no edit can slip between
 * them. With `agent`, a change of the source MUST be announced to every connection as that agent
 * editing right before it is applied; it MUST be announced as reading again if the change is then
 * refused or leaves the document's body unchanged. Once a change of the body is applied, its update
 * MUST be sent, then the text it inserted announced as that agent's edit (`agent_edit`, the ids of
 * the items the change's own transaction inserted); failing to read them MUST only skip it.
 */
export async function writeSessionSource(
  hocuspocus: Hocuspocus<CollabAccess>,
  {
    file,
    base,
    source,
    agent,
  }: { file: CollabAccess; base: string; source: string; agent?: CollabAgent }
): Promise<Result<CollabSourceWriteResult, string>> {
  if (!file.canWrite) {
    return new Err("The file cannot be written.");
  }
  const documentName = toSessionName(file.workspaceId, file.canonicalPath);
  const open = await getLoadedSession(hocuspocus, documentName);
  if (!open) {
    return new Ok("closed");
  }
  if (isStoppingWrites(hocuspocus)) {
    return new Ok("busy");
  }
  const { document, session } = open;
  if (session.lastSave.revision === undefined) {
    return new Err(
      "This document's storage does not support safe changes yet."
    );
  }

  let turn: "waiting" | "taken" | "expired" = "waiting";
  const write = (): Result<CollabSourceWriteResult, string> => {
    if (turn === "expired") {
      return new Ok("busy");
    }
    turn = "taken";
    // Unloaded while it waited for its turn: a reload reads the file into a new document.
    if (document.isDestroyed) {
      return new Ok("closed");
    }
    const current = yDocToDfm({ doc: document, comments: session.comments });
    if (current.isErr()) {
      return current;
    }
    if (current.value !== base) {
      return new Ok("changed");
    }

    // Before the change: Hocuspocus may batch the update, never a stateless message.
    const announced = agent !== undefined && source !== current.value;
    if (announced) {
      document.broadcastStateless(agentActivityMessage(agent, "editing"));
    }
    // Observed on the body: another spelling of the same document, or a change of front matter
    // alone, leaves it as it was and gives editors nothing to show.
    const body = document.getXmlFragment(BODY_FRAGMENT_NAME);
    let bodyChanged = false;
    let inserted: InsertedIdRange[] = [];
    const onBodyChange = (_events: unknown, transaction: Y.Transaction) => {
      bodyChanged = true;
      // Presentation only: a failure must not fail the write, which Yjs has applied.
      try {
        inserted = insertedRanges(transaction);
      } catch (err) {
        logger.warn(
          { err: normalizeError(err), documentName },
          "Could not read the text an agent's change inserted"
        );
      }
    };
    if (announced) {
      body.observeDeep(onBodyChange);
    }
    let comments: Result<DfmComment[], string> = new Err(
      "The change could not be applied."
    );
    try {
      // As a direct connection's change, so `onChange` records `file` as its writer.
      comments = replaceYDocContent(document, source, {
        source: "local",
        context: file,
      });
    } finally {
      if (announced) {
        body.unobserveDeep(onBodyChange);
        if (comments.isErr() || !bodyChanged) {
          document.broadcastStateless(agentActivityMessage(agent, "reading"));
        }
      }
    }
    if (comments.isErr()) {
      return comments;
    }
    if (announced && inserted.length > 0) {
      // The update first, so editors already hold the text the message names.
      document.flush();
      document.broadcastStateless(agentEditMessage(agent, inserted));
    }
    const threadsChanged =
      JSON.stringify(comments.value) !== JSON.stringify(session.comments);
    session.comments = comments.value;
    // A change of the threads alone does not go through `onChange`.
    session.lastCommenter = file;
    if (threadsChanged) {
      document.broadcastStateless(
        serverMessage({ type: "threads", comments: session.comments })
      );
    }
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
    // TODO(co-edition): refuse writes while `session.saveFailed`: an accepted write only lives
    // in memory until a save succeeds, and is lost if none ever does.
    return new Ok("written");
  };

  // A comment command builds the threads across an await: the write takes its turn among them, so
  // neither drops the threads the other wrote.
  const written = session.pendingMutations.then(write);
  // A write that throws fails for its caller only, not for the commands queued after it.
  session.pendingMutations = Promise.allSettled([written]).then(
    () => undefined
  );

  const answered = await Promise.race([
    written,
    setTimeoutAsync(COLLAB_SOURCE_WRITE_WAIT_MS),
  ]);
  // `write` runs at once when its turn comes: a turn already taken has finished.
  if (answered === "timeout" && turn === "waiting") {
    turn = "expired";
    return new Ok("busy");
  }
  return written;
}
