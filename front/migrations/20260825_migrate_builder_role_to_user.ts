import type { OrganizationMembership } from "@workos-inc/node";
import { RateLimitExceededException } from "@workos-inc/node";
import { Op } from "sequelize";

import { getWorkOS } from "@app/lib/api/workos/client";
import { invalidateWorkOSOrganizationsCacheForUserId } from "@app/lib/api/workos/organization_membership";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Migrate every active `builder` membership to `user` in both WorkOS and the front DB. One-shot,
 * re-runnable backfill for the deprecated `builder` role; run once per region (US, then EU).
 */

// A sliding-window limiter caps WorkOS traffic at 100 requests/10s — 20% of the tightest limit
// (500 writes/10s; also well under 1,000 reads/10s and 6,000 requests/60s), leaving headroom for
// live traffic sharing the API key. If a 429 still occurs our pacing is being outrun, so we abort
// the whole migration immediately rather than keep pushing. It is re-runnable: already-migrated
// rows come back as `already-user` on the next run, so nothing is lost by stopping.
//
// Reads are batched per workspace: instead of one `list` read per member, we page through each
// organization's memberships once (`ceil(members / 100)` reads) and resolve every builder from
// that in-memory map. Writes stay at most one `update` per migrated member.
const MAX_WORKOS_REQUESTS_PER_WINDOW = 100;
const RATE_LIMIT_WINDOW_MS = 10_000;
// WorkOS page size (its per-request maximum), so each organization is listed in as few reads as
// possible.
const WORKOS_LIST_PAGE_SIZE = 100;
// Keeps the limiter fed even when WorkOS is slow; the limiter, not concurrency, sets the pace.
const WORKOS_CONCURRENCY = 8;
// Log progress every this many processed memberships.
const PROGRESS_LOG_INTERVAL = 1000;

type WorkItem = {
  membershipId: number;
  userModelId: number;
  workOSUserId: string | null;
  email: string;
  workspaceModelId: number;
  workspaceSId: string;
  workOSOrganizationId: string | null;
};

// `migrated`: WorkOS role updated + DB flipped. `already-user`: WorkOS already `user` + DB flipped.
// `db-only`: no WorkOS linkage/membership, DB flipped. `unexpected-role`: WorkOS role drifted (not
// `builder`/`user`), nothing touched. `failed`: WorkOS error, DB left untouched.
type Outcome =
  | "migrated"
  | "already-user"
  | "db-only"
  | "unexpected-role"
  | "failed";

/**
 * In-process sliding-window rate limiter: `acquire()` returns once fewer than `maxRequests`
 * acquisitions happened in the trailing `windowMs`, else waits for the oldest to age out. The
 * check/record step is synchronous, so the event loop keeps it atomic across concurrent callers.
 * Local on purpose: the Redis `rateLimiter` is drop-based, the wrong shape for self-pacing.
 */
class SlidingWindowRateLimiter {
  private readonly acquisitionsMs: number[] = [];

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {}

  async acquire(): Promise<void> {
    for (;;) {
      const nowMs = Date.now();
      const windowStartMs = nowMs - this.windowMs;
      // Sorted by construction, so entries to drop are at the front.
      while (
        this.acquisitionsMs.length > 0 &&
        this.acquisitionsMs[0] <= windowStartMs
      ) {
        this.acquisitionsMs.shift();
      }

      if (this.acquisitionsMs.length < this.maxRequests) {
        this.acquisitionsMs.push(nowMs);
        return;
      }

      // At capacity: wait for the oldest to age out, then re-check.
      const waitMs = this.acquisitionsMs[0] + this.windowMs - nowMs;
      await setTimeoutAsync(Math.max(waitMs, 1));
    }
  }
}

// Thrown when a WorkOS 429 aborts the whole migration, so the abort path is distinguishable from a
// single membership's failure.
class RateLimitAbortError extends Error {}

// Outcome of listing one organization's WorkOS memberships. `ok` carries the memberships keyed by
// WorkOS user id (WorkOS enforces one membership per (user, org), so the key is unique).
// `list-failed` means the paged read errored for this org (non-429): every builder in it is marked
// `failed` and left as `builder` for a re-run, without touching the other organizations.
type OrgListing =
  | {
      status: "ok";
      membershipByWorkOSUserId: Map<string, OrganizationMembership>;
    }
  | { status: "list-failed" };

/**
 * Page through every membership of one WorkOS organization (batched read), returning them keyed by
 * WorkOS user id. Each page is metered through the shared limiter, and `shouldAbort` short-circuits
 * mid-pagination once another worker has hit a 429. A 429 here propagates so the whole run aborts.
 */
async function fetchOrgMembershipsByWorkOSUserId(
  organizationId: string,
  limiter: SlidingWindowRateLimiter,
  shouldAbort: () => boolean
): Promise<Map<string, OrganizationMembership>> {
  const workos = getWorkOS();
  const membershipByWorkOSUserId = new Map<string, OrganizationMembership>();
  let after: string | undefined = undefined;

  do {
    // Another worker already hit the rate limit: stop before issuing any more WorkOS calls.
    if (shouldAbort()) {
      throw new RateLimitAbortError(
        "Rate limit already hit; skipping WorkOS list"
      );
    }
    await limiter.acquire();
    const page = await workos.userManagement.listOrganizationMemberships({
      organizationId,
      limit: WORKOS_LIST_PAGE_SIZE,
      ...(after && { after }),
    });
    for (const membership of page.data) {
      membershipByWorkOSUserId.set(membership.userId, membership);
    }
    after = page.listMetadata?.after;
  } while (after);

  return membershipByWorkOSUserId;
}

async function processMembership(
  item: WorkItem,
  // The item's WorkOS membership resolved from the per-workspace batch listing, or `undefined` when
  // the workspace/user has no WorkOS linkage or no membership in the org — both fall through to the
  // DB-only path.
  workOSMembership: OrganizationMembership | undefined,
  execute: boolean,
  limiter: SlidingWindowRateLimiter,
  shouldAbort: () => boolean,
  logger: Logger
): Promise<Outcome> {
  const itemLogger = logger.child({
    membershipId: item.membershipId,
    workspaceId: item.workspaceSId,
    email: item.email,
  });

  // Resolve the outcome from the pre-fetched membership; only the mutation is gated behind
  // `execute`. No WorkOS membership at all falls through to the DB-only path.
  let outcome: Outcome = "db-only";
  if (workOSMembership) {
    switch (workOSMembership.role.slug) {
      case "user":
        outcome = "already-user";
        break;

      case "builder":
        outcome = "migrated";
        if (execute) {
          try {
            if (shouldAbort()) {
              throw new RateLimitAbortError(
                "Rate limit already hit; skipping WorkOS update"
              );
            }
            const workos = getWorkOS();
            await limiter.acquire();
            await workos.userManagement.updateOrganizationMembership(
              workOSMembership.id,
              { roleSlug: "user" }
            );
            // Redis, not WorkOS — not rate-limited.
            await invalidateWorkOSOrganizationsCacheForUserId(
              workOSMembership.userId
            );
          } catch (err) {
            // A 429 means our pacing is being outrun (likely by live traffic on the shared API key).
            // Propagate so the caller aborts the whole migration immediately rather than keep pushing.
            // RateLimitAbortError is the same abort already in flight from another worker.
            if (
              err instanceof RateLimitExceededException ||
              err instanceof RateLimitAbortError
            ) {
              throw err;
            }
            itemLogger.error(
              { err: normalizeError(err) },
              "WorkOS update failed; leaving DB role as 'builder' for a later re-run"
            );
            return "failed";
          }
        }
        break;

      default:
        // DB says `builder` but WorkOS holds a different role (e.g. `admin`/`manager`): the two have
        // drifted. Don't downgrade to `user` — leave both DB and WorkOS untouched and flag it for a
        // human to reconcile.
        itemLogger.warn(
          { workOSRole: workOSMembership.role.slug },
          "WorkOS role is neither 'builder' nor 'user'; skipping to avoid a downgrade"
        );
        return "unexpected-role";
    }
  }

  // WorkOS succeeded (or was legitimately skipped): flip the DB role, then invalidate the role
  // cache. That cache has no TTL (eviction is LFU-only), so without this the previous role would
  // be served indefinitely. The active-seats cache is intentionally left alone: a role change
  // never adds or removes a seat. We deliberately skip the audit log, WorkOS re-sync, and
  // search-index workflow that `MembershipResource.updateMembershipRole` would trigger.
  if (execute) {
    await MembershipModel.update(
      { role: "user" },
      { where: { id: item.membershipId } }
    );
    await MembershipResource.invalidateRoleCache({
      userModelId: item.userModelId,
      workspaceModelId: item.workspaceModelId,
    });
  }

  itemLogger.info(
    { outcome },
    execute ? "Migrated builder -> user" : "Would migrate builder -> user"
  );

  return outcome;
}

makeScript(
  {
    wIds: {
      type: "array",
      required: false,
      description:
        "Restrict the migration to these workspace sIds (for testing on a few " +
        "workspaces). Omit to run on every workspace.",
    },
  },
  async ({ execute, wIds }, logger) => {
    // Optionally scope to a handful of workspaces (testing). Resolve the sIds to model ids up
    // front so the membership query below can filter on `workspaceId` directly.
    let workspaceModelIdsFilter: number[] | null = null;
    if (wIds && wIds.length > 0) {
      const scopedWorkspaces = await WorkspaceResource.fetchByIds(wIds);
      const foundSIds = new Set(scopedWorkspaces.map((w) => w.sId));
      const missing = wIds.filter((sId) => !foundSIds.has(sId));
      if (missing.length > 0) {
        logger.warn(
          { missing },
          "Some requested workspace sIds were not found"
        );
      }
      if (scopedWorkspaces.length === 0) {
        logger.info(
          "No matching workspaces for the provided wIds; nothing to do."
        );
        return;
      }
      workspaceModelIdsFilter = scopedWorkspaces.map((w) => w.id);
    }

    // Step 1: every active builder membership (across all workspaces, or the scoped ones), in one
    // query. Revoked rows (endAt in the past) are excluded — see the file header for why they
    // don't need migrating.
    const builderMemberships = await MembershipModel.findAll({
      attributes: ["id", "userId", "workspaceId"],
      where: {
        role: "builder",
        endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: new Date() }] },
        ...(workspaceModelIdsFilter
          ? { workspaceId: { [Op.in]: workspaceModelIdsFilter } }
          : {}),
      },
    });

    if (builderMemberships.length === 0) {
      logger.info("No builder memberships to migrate.");
      return;
    }

    // Step 2: batch-fetch the referenced workspaces and users (two queries, no per-row N+1), then
    // assemble the work list.
    const workspaceModelIds = [
      ...new Set(builderMemberships.map((m) => m.workspaceId)),
    ];
    const userModelIds = [...new Set(builderMemberships.map((m) => m.userId))];

    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    const workspacesById = new Map(workspaces.map((w) => [w.id, w]));

    const users = await UserResource.fetchByModelIds(userModelIds);
    const usersById = new Map(users.map((u) => [u.id, u]));

    const workItems: WorkItem[] = [];
    for (const m of builderMemberships) {
      const workspace = workspacesById.get(m.workspaceId);
      if (!workspace) {
        continue;
      }
      const user = usersById.get(m.userId);
      workItems.push({
        membershipId: m.id,
        userModelId: m.userId,
        workOSUserId: user?.workOSUserId ?? null,
        email: user?.email ?? "unknown",
        workspaceModelId: m.workspaceId,
        workspaceSId: workspace.sId,
        workOSOrganizationId: workspace.workOSOrganizationId ?? null,
      });
    }

    // One limiter meters every WorkOS call (list pages and updates alike), keeping the rate under
    // the WorkOS limits regardless of latency.
    const limiter = new SlidingWindowRateLimiter(
      MAX_WORKOS_REQUESTS_PER_WINDOW,
      RATE_LIMIT_WINDOW_MS
    );

    // Shared across workers: once any worker hits a 429, every other worker stops issuing WorkOS
    // calls at once and the whole run aborts.
    let rateLimitHit = false;
    const shouldAbort = () => rateLimitHit;

    // Reject `concurrentExecutor` and stop the whole migration when a 429 surfaces, flagging the
    // shared abort so in-flight workers bail out too. RateLimitAbortError from a sibling worker is
    // the same abort already being reported by whoever set `rateLimitHit`.
    const abortOnRateLimit = (err: unknown, context: object): never => {
      if (err instanceof RateLimitExceededException) {
        rateLimitHit = true;
        logger.error(
          {
            ...context,
            err: normalizeError(err),
            retryAfterSeconds: err.retryAfter,
          },
          "Hit WorkOS rate limit — aborting migration immediately. " +
            "Already-migrated rows are safe; re-run later to finish."
        );
      }
      throw err;
    };

    // Step 3: batch-list each linked organization's WorkOS memberships once (paged reads), so
    // Step 4 can resolve every member from memory instead of a per-member `list` read. A non-429
    // list error is confined to that organization (its builders become `failed`); a 429 aborts the
    // whole run. Listing is read-only, so it runs in dry-run too for fidelity.
    const organizationIds = [
      ...new Set(
        workItems
          .map((item) => item.workOSOrganizationId)
          .filter((id): id is string => id !== null)
      ),
    ];
    const orgListings = new Map<string, OrgListing>();
    await concurrentExecutor(
      organizationIds,
      async (organizationId) => {
        try {
          const membershipByWorkOSUserId =
            await fetchOrgMembershipsByWorkOSUserId(
              organizationId,
              limiter,
              shouldAbort
            );
          orgListings.set(organizationId, {
            status: "ok",
            membershipByWorkOSUserId,
          });
        } catch (err) {
          if (
            err instanceof RateLimitExceededException ||
            err instanceof RateLimitAbortError
          ) {
            abortOnRateLimit(err, { organizationsListed: orgListings.size });
          }
          logger.error(
            { err: normalizeError(err), organizationId },
            "Failed to list WorkOS memberships for organization; its builders " +
              "will be marked failed and left for a re-run"
          );
          orgListings.set(organizationId, { status: "list-failed" });
        }
      },
      { concurrency: WORKOS_CONCURRENCY }
    );

    // Step 4: WorkOS-first then DB, resolving each member's WorkOS role from the batched listing.
    let processedCount = 0;
    const outcomes = await concurrentExecutor(
      workItems,
      async (item) => {
        try {
          // Resolve the item's WorkOS membership from the per-workspace listing. A failed listing
          // short-circuits to `failed`; no linkage / not found leaves `workOSMembership` undefined
          // (the DB-only path).
          const listing = item.workOSOrganizationId
            ? orgListings.get(item.workOSOrganizationId)
            : undefined;
          if (listing?.status === "list-failed") {
            return "failed";
          }
          const workOSMembership =
            listing?.status === "ok" && item.workOSUserId
              ? listing.membershipByWorkOSUserId.get(item.workOSUserId)
              : undefined;

          const outcome = await processMembership(
            item,
            workOSMembership,
            execute,
            limiter,
            shouldAbort,
            logger
          );
          processedCount += 1;
          if (processedCount % PROGRESS_LOG_INTERVAL === 0) {
            logger.info(
              { processed: processedCount, total: workItems.length },
              "Processing progress"
            );
          }
          return outcome;
        } catch (err) {
          return abortOnRateLimit(err, {
            processed: processedCount,
            total: workItems.length,
          });
        }
      },
      { concurrency: WORKOS_CONCURRENCY }
    );

    const summary: Record<Outcome, number> = {
      migrated: 0,
      "already-user": 0,
      "db-only": 0,
      "unexpected-role": 0,
      failed: 0,
    };
    for (const outcome of outcomes) {
      summary[outcome] += 1;
    }

    logger.info(
      { ...summary, total: workItems.length },
      execute
        ? "Builder -> user migration complete"
        : "Builder -> user migration dry run complete"
    );
  }
);
