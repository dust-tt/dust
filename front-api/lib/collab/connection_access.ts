import type {
  CollabAccess,
  CollabAccessError,
} from "@app/lib/api/collab/access";
import {
  checkCollabAccess,
  recheckCollabAccess,
} from "@app/lib/api/collab/access";
import { redeemCollabTicket } from "@app/lib/api/collab/tickets";
import { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Connection, Hocuspocus } from "@hocuspocus/server";

/**
 * @cc [owner:PopDaph,label:security] collab-connection-auth
 * A connection MUST open only with a ticket redeemed for the workspace and the file its document
 * name carries, and only if `checkCollabAccess` still lets the ticket's user open that file.
 */
export async function authenticateConnection(
  parsed: { workspaceId: string; canonicalPath: string },
  token: string
): Promise<Result<CollabAccess, string>> {
  const ticket = await redeemCollabTicket(token);
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
  const file = await checkCollabAccess(auth, parsed.canonicalPath);
  if (file.isErr()) {
    return new Err(file.error.message);
  }
  return new Ok(file.value);
}

// Hocuspocus's `Forbidden`, from `@hocuspocus/common`.
const FORBIDDEN = { code: 4403, reason: "Forbidden" };

export const ACCESS_RECHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * @cc [owner:PopDaph,label:security;performance] collab-connection-recheck
 * The collab server MUST start a sweep every `ACCESS_RECHECK_INTERVAL_MS`, unless the previous one
 * is still running. Every WebSocket document connection of this process open when the sweep starts
 * MUST be checked again with `recheckCollabAccess`, with an Authenticator freshly built for its user
 * in this sweep, and MUST be closed when the check fails or throws.
 * A failure checking one user and document MUST NOT stop the others: it is logged and their
 * connections closed, an exception to `no-catching-own-errors` limited to it. The returned promise
 * MUST resolve once every connection has been checked. Its per-user and per-document reads are an
 * exception to `batch-database-queries`, limited to it: they reuse the Authenticator and the file
 * system's permission checks, which have no batch API, and run at most 4 at a time.
 */
export async function recheckAllConnections(
  hocuspocus: Hocuspocus<CollabAccess>
): Promise<void> {
  const startedAt = Date.now();
  // One check per user and document, however many tabs they have open. Each process sweeps only
  // its own connections, so the work spreads over replicas.
  const groups = new Map<string, Connection[]>();
  for (const document of hocuspocus.documents.values()) {
    for (const connection of document.getConnections()) {
      const context: CollabAccess = connection.context;
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
      let access: Result<void, CollabAccessError>;
      try {
        const fresh = await authenticatorFor(userId, workspaceId);
        access = await recheckCollabAccess(fresh, canonicalPath);
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
