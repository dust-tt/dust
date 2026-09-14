import { Op } from "sequelize";

import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  concurrentExecutor,
  setTimeoutAsync,
} from "@app/lib/utils/async_utils";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Migrate every active `builder` membership to `user` in both WorkOS and the front DB. One-shot,
 * re-runnable backfill for the deprecated `builder` role.
 */

// A sliding-window limiter caps the pace of `updateMembershipRole` invocations. We can't meter the
// individual WorkOS calls it makes internally, so we gate the invocations instead. Each invocation
// makes two WorkOS requests that hit separate rate-limit buckets: one read and one write.
// At 50 invocations/10s that is 50 reads/10s (5% of the 1,000 reads/10s bucket),
// 50 writes/10s (10% of the 500 writes/10s bucket), and 100 requests/10s = 600/60s (10% of the 6,000 requests/60s general limit).
const MAX_MIGRATIONS_PER_WINDOW = 50;
const RATE_LIMIT_WINDOW_MS = 10_000;
// Keeps the limiter fed even when WorkOS is slow; the limiter, not concurrency, sets the pace.
const MIGRATION_CONCURRENCY = 8;

type Outcome = "migrated" | "already-user" | "skipped" | "failed";

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

/**
 * Migrate one builder membership to `user` via `MembershipResource.updateMembershipRole`, which
 * handles the DB flip, WorkOS sync, cache invalidation, audit log and search-index workflow. Pace
 * control lives here: every invocation is gated through the shared limiter.
 */
async function migrateMembership(
  user: UserResource,
  workspace: LightWorkspaceType,
  execute: boolean,
  limiter: SlidingWindowRateLimiter,
  logger: Logger
): Promise<Outcome> {
  const itemLogger = logger.child({
    userId: user.sId,
    workspaceId: workspace.sId,
    email: user.email,
  });

  if (!execute) {
    itemLogger.info("Would migrate builder -> user");
    return "migrated";
  }

  // Gate the invocation, not the WorkOS calls it makes internally (which we can't meter here).
  await limiter.acquire();

  try {
    const res = await MembershipResource.updateMembershipRole({
      user,
      workspace,
      newRole: "user",
      allowTerminated: false,
      author: "no-author",
    });

    if (res.isOk()) {
      itemLogger.info(
        { previousRole: res.value.previousRole },
        "Migrated builder -> user"
      );
      return "migrated";
    }

    switch (res.error.type) {
      case "already_on_role":
        // Someone flipped it to `user` between our query and now: nothing to do.
        return "already-user";

      case "not_found":
      case "membership_already_terminated":
      case "last_admin":
        itemLogger.warn(
          { reason: res.error.type },
          "Skipped builder membership (updateMembershipRole declined)"
        );
        return "skipped";

      default:
        return assertNever(res.error.type);
    }
  } catch (err) {
    // `updateMembershipRole` throws if the search-index workflow fails to launch (after the DB role
    // and audit log are already written). Leave it for a human to check rather than aborting the run.
    itemLogger.error(
      { err: normalizeError(err) },
      "updateMembershipRole threw; membership may be partially migrated"
    );
    return "failed";
  }
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
    // resolve each membership against these maps.
    const workspaceModelIds = [
      ...new Set(builderMemberships.map((m) => m.workspaceId)),
    ];
    const userModelIds = [...new Set(builderMemberships.map((m) => m.userId))];

    const workspaces =
      await WorkspaceResource.fetchByModelIds(workspaceModelIds);
    const workspacesById = new Map(
      workspaces.map((w) => [w.id, renderLightWorkspaceType({ workspace: w })])
    );

    const users = await UserResource.fetchByModelIds(userModelIds);
    const usersById = new Map(users.map((u) => [u.id, u]));

    // One limiter meters every `updateMembershipRole` invocation, keeping the WorkOS traffic under
    // the WorkOS limits regardless of latency.
    const limiter = new SlidingWindowRateLimiter(
      MAX_MIGRATIONS_PER_WINDOW,
      RATE_LIMIT_WINDOW_MS
    );

    // Step 3: migrate each membership through `updateMembershipRole`, paced by the limiter.
    const outcomes = await concurrentExecutor(
      builderMemberships,
      async (m): Promise<Outcome> => {
        const workspace = workspacesById.get(m.workspaceId);
        const user = usersById.get(m.userId);
        if (!workspace || !user) {
          logger.warn(
            {
              membershipId: m.id,
              userModelId: m.userId,
              workspaceModelId: m.workspaceId,
            },
            "Could not resolve user or workspace for builder membership; skipping"
          );
          return "skipped";
        }

        const outcome = await migrateMembership(
          user,
          workspace,
          execute,
          limiter,
          logger
        );

        return outcome;
      },
      { concurrency: MIGRATION_CONCURRENCY }
    );

    const summary: Record<Outcome, number> = {
      migrated: 0,
      "already-user": 0,
      skipped: 0,
      failed: 0,
    };
    for (const outcome of outcomes) {
      summary[outcome] += 1;
    }

    logger.info(
      { ...summary, total: builderMemberships.length },
      execute
        ? "Builder -> user migration complete"
        : "Builder -> user migration dry run complete"
    );
  }
);
