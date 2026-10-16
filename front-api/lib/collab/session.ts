import type { CollabAccess } from "@app/lib/api/collab/access";
import type { CollabSave } from "@app/lib/api/collab/session_file";
import {
  CollabSaveError,
  keepConflictingFile,
  saveCollabSession,
} from "@app/lib/api/collab/session_file";
import { replaceYDocContent, yDocToDfm } from "@app/lib/api/collab/ydoc";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";

import type {
  SaveState,
  SaveStateMessage,
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Document, Hocuspocus } from "@hocuspocus/server";
import type * as Y from "yjs";

/** What front-collab holds for an open file beside its Yjs state, to save it. */
export interface CollabSession {
  comments: DfmComment[];
  lastSave: CollabSave;
  saveFailed: boolean;
  /** The save retried next while saves fail, and how many were retried since the last success. */
  saveRetryTimer: ReturnType<typeof setTimeout> | undefined;
  saveRetries: number;
  /** Where the file's version was last kept after a save conflict, for editors joining later. */
  conflictCopy: string | undefined;
  /** The connection that last changed the text. */
  lastChangedBy: CollabAccess | undefined;
  /** The connection that last changed the threads, which saves them when nobody changed the text. */
  lastCommenter: CollabAccess | undefined;
  graceTimer: ReturnType<typeof setTimeout> | undefined;
  pendingMutations: Promise<void>;
}

// A failed save is retried after this delay, doubled at each failure up to the maximum: longer
// than a debounced store, short enough that a passing storage error clears before people notice,
// and at most every few minutes for a failure that lasts.
export const SAVE_RETRY_DELAY_MS = 30 * 1000;
const SAVE_RETRY_MAX_DELAY_MS = 5 * 60 * 1000;

/** How a save ended: `failed_until_edited` is not retried, since only an edit can fix it. */
export type SaveOutcome = "saved" | "failed" | "failed_until_edited";

/** The session's save state, as its editors show it. */
export const toSaveState = (session: CollabSession): SaveState => ({
  failed: session.saveFailed,
  conflictCopy: session.conflictCopy ?? null,
});

export const saveStateMessage = (state: SaveState) =>
  JSON.stringify({ type: "save_state", ...state } satisfies SaveStateMessage);

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
 * retries a change that lands later; so MUST a write once `saveAllSessions` was called. While the
 * session's last save failed, a write MUST answer `unsaved` and change nothing, at its turn.
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
    if (session.saveFailed) {
      return new Ok("unsaved");
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
    if (threadsChanged) {
      // A change of the threads alone does not go through `onChange`.
      session.lastCommenter = file;
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

/**
 * Records how `document`'s last save ended, tells its connections when whether it failed
 * changes, and schedules a retry after a failure a retry can fix.
 */
export function recordSaveResult(
  hocuspocus: Hocuspocus<CollabAccess>,
  document: Document,
  outcome: SaveOutcome
): void {
  const session = getSession(document);
  if (!session) {
    return;
  }
  let failed: boolean;
  switch (outcome) {
    case "saved":
      failed = false;
      clearTimeout(session.saveRetryTimer);
      session.saveRetryTimer = undefined;
      session.saveRetries = 0;
      break;
    case "failed_until_edited":
      failed = true;
      clearTimeout(session.saveRetryTimer);
      session.saveRetryTimer = undefined;
      break;
    case "failed":
      failed = true;
      // A failure while a retry is pending leaves it as scheduled: the delay doubles per retry.
      if (session.saveRetryTimer === undefined) {
        const delayMs = Math.min(
          SAVE_RETRY_DELAY_MS * 2 ** session.saveRetries,
          SAVE_RETRY_MAX_DELAY_MS
        );
        session.saveRetries++;
        session.saveRetryTimer = setTimeout(() => {
          session.saveRetryTimer = undefined;
          // Unloaded, it has nothing left to save; shutting down, `saveAllSessions` saves it.
          if (document.isDestroyed || isStoppingWrites(hocuspocus)) {
            return;
          }
          // Not awaited: `onStoreDocument` logs a failure and schedules the next retry.
          void hocuspocus.storeDocumentHooks(
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
          );
        }, delayMs);
      }
      break;
    default:
      assertNever(outcome);
  }
  if (session.saveFailed !== failed) {
    session.saveFailed = failed;
    document.broadcastStateless(saveStateMessage(toSaveState(session)));
  }
}

// A file written again while its conflict is kept starts another round, at most this many per save.
const MAX_CONFLICT_ROUNDS = 3;

/**
 * @cc [owner:PopDaph,label:product;concurrency] collab-session-save-conflict
 * Each round MUST save with `saveCollabSession` through the connection that last changed the
 * document by then, `writer` when none did, and fail without saving when it cannot write. When a
 * save fails with `revision_conflict`, the file's version MUST be kept with `keepConflictingFile`
 * before the session saves over it: the session's last save becomes the file as now stored, and
 * when a copy was written, its path MUST be recorded in the session's save state and that state
 * sent to every connection. It MUST then save again, at most `MAX_CONFLICT_ROUNDS` times, and
 * return the first failure it cannot recover: any failure but a conflict, a conflict whose file
 * cannot be kept, or a conflict past the last round.
 */
export async function saveSession(
  document: Document,
  writer: CollabAccess
): Promise<Result<CollabSave, CollabSaveError>> {
  const session = getSession(document);
  if (!session) {
    return new Err(
      new CollabSaveError("failed", "The document has no session.")
    );
  }
  for (let round = 0; ; round++) {
    // Someone may have edited while the last round awaited: save through whoever changed it last.
    const current = session.lastChangedBy ?? session.lastCommenter ?? writer;
    if (current.canWrite !== true) {
      return new Err(
        new CollabSaveError(
          "failed",
          "The document was changed without a writer."
        )
      );
    }
    const saved = await saveCollabSession(
      current,
      { doc: document, comments: session.comments },
      session.lastSave
    );
    if (
      saved.isOk() ||
      saved.error.code !== "revision_conflict" ||
      round === MAX_CONFLICT_ROUNDS
    ) {
      return saved;
    }
    const kept = await keepConflictingFile(current, session.lastSave);
    if (kept.isErr()) {
      logger.warn(
        {
          documentName: document.name,
          workspaceId: current.workspaceId,
          reason: kept.error.message,
        },
        "Collab conflict not kept"
      );
      return saved;
    }
    session.lastSave = kept.value.lastSave;
    const { copyPath } = kept.value;
    if (copyPath) {
      session.conflictCopy = copyPath;
      logger.info(
        {
          documentName: document.name,
          workspaceId: current.workspaceId,
          copyPath,
        },
        "Collab conflict kept as a copy"
      );
      document.broadcastStateless(saveStateMessage(toSaveState(session)));
    }
  }
}
