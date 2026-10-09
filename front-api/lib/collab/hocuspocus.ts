import {
  applyLiveCommentCommand,
  dispatchLiveCommentMentions,
} from "@app/lib/api/collab/live_comments";
import type {
  LiveAccessError,
  LiveCheckpoint,
  LiveFile,
} from "@app/lib/api/collab/live_file";
import {
  checkLiveAccess,
  checkpointLiveDocument,
  loadLiveDocument,
  recheckLiveAccess,
} from "@app/lib/api/collab/live_file";
import { redeemLiveTicket } from "@app/lib/api/collab/tickets";
import { replaceYDocContent, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { Authenticator } from "@app/lib/auth";
import type { DfmComment } from "@app/lib/markdown/dfm";
import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  LiveAgent,
  LiveAgentActivity,
  LiveAgentServerMessage,
  LiveCommentErrorCode,
  LiveCommentServerMessage,
  LiveSourceReadResponse,
  LiveSourceWriteResult,
} from "@app/types/collab";
import {
  LIVE_SOURCE_WRITE_WAIT_MS,
  liveCommentClientMessageSchema,
  parseLiveDocumentName,
  toLiveDocumentName,
} from "@app/types/collab";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { safeParseJSON } from "@app/types/shared/utils/json_utils";
import type { Connection, Document } from "@hocuspocus/server";
import { Hocuspocus } from "@hocuspocus/server";
import { z } from "zod";

export const UNLOAD_GRACE_PERIOD_MS = 5 * 60 * 1000;
const COMMENT_COMMAND_TIMEOUT_MS = 30 * 1000;

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

const agentActivityMessage = (
  agent: LiveAgent,
  activity: LiveAgentActivity
): string =>
  JSON.stringify({
    type: "agent_activity",
    agent,
    activity,
  } satisfies LiveAgentServerMessage);

const refusedMessage = (requestId: string, error: LiveCommentErrorCode) =>
  serverMessage({ type: "refused", requestId, error });

type CommandResult = Awaited<ReturnType<typeof applyLiveCommentCommand>>;

const commandRequestSchema = z.object({
  type: z.literal("command"),
  requestId: z.string().min(1),
});

const sessions = new WeakMap<Document, LiveSession>();
const shuttingDown = new WeakSet<Hocuspocus<LiveFile>>();

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
 * connection of the document and the document stored, so the checkpoint writes them, through the
 * connection that last changed its text, or through the commenter's when none did, and the
 * message it added handed to `dispatchLiveCommentMentions` without waiting for it. A command its
 * document unloaded before it finished MUST change nothing. Every command carrying a request id
 * MUST be answered, refused as `unavailable` when it is invalid, failed, outlived its document or
 * did not finish within `COMMENT_COMMAND_TIMEOUT_MS`, and a failing or late command MUST NOT hold
 * the later ones. Any other message that is not a valid client message MUST be ignored.
 */
export function createCollabHocuspocus(): Hocuspocus<LiveFile> {
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
      const file: LiveFile = connection.context;
      const json = safeParseJSON(payload);
      const message = json.isOk()
        ? liveCommentClientMessageSchema.safeParse(json.value)
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
            applyLiveCommentCommand(file, session.comments, command),
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
        const result: CommandResult = document.isDestroyed
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

        // TODO(co-edition): refuse commands while `session.checkpointFailed`: an accepted comment
        // only lives in memory until a checkpoint succeeds, and is lost if none ever does.
        // TODO(co-edition): a command still applies after its sender left, whose channel already
        // answered it `unavailable`; a retried `add` then makes a second thread.
        session.comments = result.value.comments;
        session.lastChangedBy ??= file;
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
          // Not awaited, as a save of the file does not wait for its mentions to be posted.
          void dispatchLiveCommentMentions(
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
 * first. From the call on, `writeLiveSource` MUST answer `busy`, and the writes and comment
 * commands already queued MUST finish before the checkpoints. The returned promise MUST resolve
 * only once each checkpoint has finished or failed.
 */
export async function checkpointAllDocuments(
  hocuspocus: Hocuspocus<LiveFile>
): Promise<void> {
  shuttingDown.add(hocuspocus);
  // A load may still apply edits queued while it ran; its failure was already logged.
  for (const loading of [...hocuspocus.loadingDocuments.values()]) {
    await loading.catch(() => undefined);
  }
  // Their writes only reach the file through the checkpoints below.
  await Promise.all(
    [...hocuspocus.documents.values()].map(
      (document) => sessions.get(document)?.commentCommands
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
          // The store hook checkpoints through the last writer it recorded, not this context.
          lastContext: undefined,
          lastTransactionOrigin: undefined,
        },
        true
      ),
    { concurrency: 8 }
  );
}

/** The document and its session while one is open, once it has finished loading or unloading. */
async function openSession(
  hocuspocus: Hocuspocus<LiveFile>,
  documentName: string
): Promise<{ document: Document; session: LiveSession } | null> {
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
 * @cc [owner:tdraier,label:product;concurrency] collab-live-source-read
 * A document MUST be reported open while Hocuspocus holds it, after waiting for a load or an
 * unload in progress, with as source what `yDocToDfm` gives for it and the session's threads.
 */
export async function readLiveSource(
  hocuspocus: Hocuspocus<LiveFile>,
  documentName: string
): Promise<Result<LiveSourceReadResponse, string>> {
  const open = await openSession(hocuspocus, documentName);
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
 * user may open the document live.
 */
export function showLiveAgentActivity(
  hocuspocus: Hocuspocus<LiveFile>,
  documentName: string,
  agent: LiveAgent,
  activity: LiveAgentActivity
): void {
  const document = hocuspocus.documents.get(documentName);
  if (document && !document.isDestroyed) {
    document.broadcastStateless(agentActivityMessage(agent, activity));
  }
}

/**
 * @cc [owner:tdraier,label:product;concurrency;security] collab-live-source-write
 * A write MUST only target the document named after `file`'s workspace and path, so its checkpoint
 * writes the file the document was loaded from. It MUST answer `closed`, changing nothing, when
 * `readLiveSource` would report the document closed, and `changed`, changing nothing, unless the
 * source `readLiveSource` would return is `base`. Otherwise it MUST apply `source` with
 * `replaceYDocContent` as a change from `file`, replace the session's threads with the ones it
 * returns, send them to every connection when they changed, and store the document so the
 * checkpoint writes the change; a source the editor refuses MUST fail and change nothing. `file`
 * MUST be able to write, and the session's storage MUST have revisions, since without them its
 * checkpoints could not be conditional; otherwise the write MUST fail and change nothing. It MUST
 * take its turn among the document's comment commands, answering `closed` if the document unloaded
 * meanwhile, and a write that fails MUST NOT hold the later ones. A write whose turn has not come
 * within `LIVE_SOURCE_WRITE_WAIT_MS` MUST answer `busy` and never apply, so its caller never
 * retries a change that lands later; so MUST a write once `checkpointAllDocuments` was called.
 * Nothing may run between the comparison with `base` and the change, so no edit can slip between
 * them. With `agent`, a change of the source MUST be announced to every connection as that agent
 * editing right before it is applied; it MUST be announced as reading again if the change is then
 * refused or leaves the document unchanged.
 */
export async function writeLiveSource(
  hocuspocus: Hocuspocus<LiveFile>,
  {
    file,
    base,
    source,
    agent,
  }: { file: LiveFile; base: string; source: string; agent?: LiveAgent }
): Promise<Result<LiveSourceWriteResult, string>> {
  if (!file.canWrite) {
    return new Err("The file cannot be written.");
  }
  const documentName = toLiveDocumentName(file.workspaceId, file.canonicalPath);
  const open = await openSession(hocuspocus, documentName);
  if (!open) {
    return new Ok("closed");
  }
  if (shuttingDown.has(hocuspocus)) {
    return new Ok("busy");
  }
  const { document, session } = open;
  if (session.checkpoint.revision === undefined) {
    return new Err(
      "This document's storage does not support safe changes yet."
    );
  }

  let turn: "waiting" | "taken" | "expired" = "waiting";
  const write = (): Result<LiveSourceWriteResult, string> => {
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
    // Another spelling of the same document changes nothing, and Yjs then emits no update. The
    // state vector would miss a deletion, which emits one without advancing it.
    let changed = false;
    const onUpdate = () => {
      changed = true;
    };
    if (announced) {
      document.on("update", onUpdate);
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
        document.off("update", onUpdate);
        if (comments.isErr() || !changed) {
          document.broadcastStateless(agentActivityMessage(agent, "reading"));
        }
      }
    }
    if (comments.isErr()) {
      return comments;
    }
    const threadsChanged =
      JSON.stringify(comments.value) !== JSON.stringify(session.comments);
    session.comments = comments.value;
    // A change of the threads alone does not go through `onChange`.
    session.lastChangedBy ??= file;
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
    // TODO(co-edition): refuse writes while `session.checkpointFailed`: an accepted write only lives
    // in memory until a checkpoint succeeds, and is lost if none ever does.
    return new Ok("written");
  };

  // A comment command builds the threads across an await: the write takes its turn among them, so
  // neither drops the threads the other wrote.
  const written = session.commentCommands.then(write);
  // A write that throws fails for its caller only, not for the commands queued after it.
  session.commentCommands = Promise.allSettled([written]).then(() => undefined);

  const answered = await Promise.race([
    written,
    setTimeoutAsync(LIVE_SOURCE_WRITE_WAIT_MS),
  ]);
  // `write` runs at once when its turn comes: a turn already taken has finished.
  if (answered === "timeout" && turn === "waiting") {
    turn = "expired";
    return new Ok("busy");
  }
  return written;
}

// Hocuspocus's `Forbidden`, from `@hocuspocus/common`.
const FORBIDDEN = { code: 4403, reason: "Forbidden" };

export const ACCESS_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * @cc [owner:PopDaph,label:security;performance] collab-access-recheck
 * The collab server MUST start a sweep every `ACCESS_RECHECK_INTERVAL_MS`, unless the previous one
 * is still running. Every WebSocket document connection of this process open when the sweep starts
 * MUST be checked again with `recheckLiveAccess`, with an Authenticator freshly built for its user
 * in this sweep, and MUST be closed when the check fails or throws.
 * A failure checking one user and document MUST NOT stop the others: it is logged and their
 * connections closed, an exception to `no-catching-own-errors` limited to it. The returned promise
 * MUST resolve once every connection has been checked. Its per-user and per-document reads are an
 * exception to `batch-database-queries`, limited to it: they reuse the Authenticator and the file
 * system's permission checks, which have no batch API, and run at most 4 at a time.
 */
export async function recheckAllConnections(
  hocuspocus: Hocuspocus<LiveFile>
): Promise<void> {
  const startedAt = Date.now();
  // One check per user and document, however many tabs they have open. Each process sweeps only
  // its own connections, so the work spreads over replicas.
  const groups = new Map<string, Connection[]>();
  for (const document of hocuspocus.documents.values()) {
    for (const connection of document.getConnections()) {
      const context: LiveFile = connection.context;
      const key = `${context.auth.getNonNullableUser().sId}:${document.name}`;
      const group = groups.get(key);
      if (group) {
        group.push(connection);
      } else {
        groups.set(key, [connection]);
      }
    }
  }

  // One fresh Authenticator per user and workspace, shared by their documents in this sweep.
  const authenticators = new Map<string, Promise<Authenticator>>();
  const authenticatorFor = (userId: string, workspaceId: string) => {
    const key = `${userId}:${workspaceId}`;
    const existing = authenticators.get(key);
    if (existing) {
      return existing;
    }
    const built = Authenticator.fromUserIdAndWorkspaceId(userId, workspaceId);
    authenticators.set(key, built);
    return built;
  };

  let closed = 0;
  let failed = 0;
  // TODO(co-edition): batch these reads. Each group still builds an Authenticator per user and
  // resolves the file's permissions per document; batching needs a way to load many users' groups
  // at once and to resolve many files' permissions at once. Do it once the sweep log shows
  // durations growing towards ACCESS_RECHECK_INTERVAL_MS.
  await concurrentExecutor(
    [...groups.values()],
    async (connections) => {
      const { auth, workspaceId, canonicalPath } = connections[0].context;
      const userId = auth.getNonNullableUser().sId;
      const close = () => {
        for (const connection of connections) {
          connection.close(FORBIDDEN);
        }
        closed += connections.length;
      };
      let access: Result<void, LiveAccessError>;
      try {
        const fresh = await authenticatorFor(userId, workspaceId);
        access = await recheckLiveAccess(fresh, canonicalPath);
      } catch (err) {
        failed++;
        logger.error(
          { err: normalizeError(err), workspaceId, userId },
          "Collab access re-check failed, closing its connections"
        );
        // Access is unknown: closed, as when it is lost. The browser reconnects with a new ticket.
        close();
        return;
      }
      if (access.isOk()) {
        return;
      }
      logger.info(
        { workspaceId, userId, reason: access.error.message },
        "Collab connection closed: access lost"
      );
      close();
    },
    { concurrency: 4 }
  );

  // A sweep growing close to the interval means revocation gets slower: time to scale.
  logger.info(
    {
      checked: groups.size,
      closed,
      failed,
      durationMs: Date.now() - startedAt,
    },
    "Collab access re-check done"
  );
}
