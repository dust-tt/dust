/**
 * Revoke stray free-seat credits (and clear their alerts): users who
 * currently hold a Metronome `free_seat` per-user credit but whose DB
 * membership seat type isn't (or is no longer) `free`.
 *
 * Written for legacy-contract workspaces where a bug in `syncSeatCount`
 * (fixed separately) wrongly treated every member as "currently free" and
 * granted a `free-<sId>` credit + alerts for all of them. On a legacy
 * contract no membership should ever have `seatType === "free"`, so every
 * credit found there is stray — but the script still cross-checks against
 * current DB membership state rather than assuming that, so it's safe to
 * run against any workspace with stray free-seat credits, legacy or not.
 *
 * Iterates every workspace with a metronomeCustomerId by default; pass
 * --workspaceId to scope to just one. Dry-run by default; pass --execute to
 * actually revoke/clear.
 *
 *   npx tsx scripts/revoke_stray_free_seat_credits.ts
 *   npx tsx scripts/revoke_stray_free_seat_credits.ts --workspaceId <wId> --execute
 */
import { clearPerUserCreditBalanceAlerts } from "@app/lib/metronome/alerts/per_user_credit_balance";
import {
  listCustomerPerUserCreditIds,
  revokePerUserCustomerCredit,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  toFreeMetronomeUserId,
} from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { Logger } from "@app/logger/logger";
import type { LightWorkspaceType } from "@app/types/user";

import { makeScript } from "./helpers";
import { runOnAllWorkspaces } from "./workspace_helpers";

// Metronome publishes an 11 RPS API limit. Cap this script well under it to
// leave headroom for concurrent production traffic on the same API key.
const METRONOME_MAX_RPS = 8;
const METRONOME_MIN_INTERVAL_MS = 1000 / METRONOME_MAX_RPS;
let metronomeNextSlotAt = 0;

async function paceMetronome<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const slot = Math.max(now, metronomeNextSlotAt);
  metronomeNextSlotAt = slot + METRONOME_MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  return fn();
}

async function revokeStrayFreeSeatCreditsForWorkspace(
  workspace: LightWorkspaceType,
  execute: boolean,
  logger: Logger
): Promise<void> {
  const { metronomeCustomerId } = workspace;
  if (!metronomeCustomerId) {
    return;
  }

  const { memberships } = await MembershipResource.getActiveMemberships({
    workspace,
  });
  const currentFreeUserIds = new Set(
    memberships.flatMap((m) =>
      m.user?.sId && m.seatType === "free" ? [m.user.sId] : []
    )
  );

  // Only credit ids are needed here (to revoke) — not balances, which
  // Metronome computes for every credit and makes the listing meaningfully
  // heavier.
  const creditsResult = await paceMetronome(() =>
    listCustomerPerUserCreditIds({
      metronomeCustomerId,
      contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
    })
  );
  if (creditsResult.isErr()) {
    logger.error(
      { workspaceId: workspace.sId, error: creditsResult.error },
      "Failed to list per-user free-seat credits"
    );
    return;
  }
  if (creditsResult.value.size === 0) {
    return;
  }

  // `listCustomerPerUserCreditIds` already strips the "free-" prefix, so its
  // map is keyed by the plain sId.
  const toRevoke = [...creditsResult.value.entries()].filter(
    ([userId]) => !currentFreeUserIds.has(userId)
  );
  if (toRevoke.length === 0) {
    return;
  }

  logger.info(
    {
      workspaceId: workspace.sId,
      totalFreeSeatCredits: creditsResult.value.size,
      currentFreeUserCount: currentFreeUserIds.size,
      strayCount: toRevoke.length,
    },
    execute
      ? "Revoking stray free-seat credits"
      : "[DRY RUN] Would revoke these stray free-seat credits"
  );

  await concurrentExecutor(
    toRevoke,
    async ([userId, creditIds]) => {
      if (!execute) {
        logger.info(
          { workspaceId: workspace.sId, userId, creditIds },
          "[DRY RUN] Would revoke credit(s) and clear alerts"
        );
        return;
      }

      for (const creditId of creditIds) {
        const revokeResult = await paceMetronome(() =>
          revokePerUserCustomerCredit({ metronomeCustomerId, creditId })
        );
        if (revokeResult.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              userId,
              creditId,
              error: revokeResult.error,
            },
            "Failed to revoke stray free-seat credit"
          );
        }
      }

      // Alerts are created with the free-prefixed user id (see
      // `grantFreeSeatCredits`'s `upsertPerUserCreditBalanceAlerts` call) —
      // must clear with the same form or `clearMetronomeAlert` targets a
      // uniqueness key that was never created.
      const clearResult = await paceMetronome(() =>
        clearPerUserCreditBalanceAlerts({
          metronomeCustomerId,
          workspaceId: workspace.sId,
          userId: toFreeMetronomeUserId(userId),
        })
      );
      if (clearResult.isErr()) {
        logger.error(
          { workspaceId: workspace.sId, userId, error: clearResult.error },
          "Failed to clear stray free-seat credit alerts"
        );
      } else {
        logger.info(
          { workspaceId: workspace.sId, userId },
          "Revoked credit and cleared alerts"
        );
      }
    },
    { concurrency: 4 }
  );
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string" as const,
      description:
        "Optional workspace sId to process (processes all if omitted)",
      demandOption: false,
    },
    fromWorkspaceId: {
      type: "number" as const,
      description:
        "Resume from this numeric workspace model id (skips workspaces with id < this value)",
      demandOption: false,
    },
  },
  async ({ workspaceId, fromWorkspaceId, execute }, logger) => {
    await runOnAllWorkspaces(
      async (workspace) => {
        await revokeStrayFreeSeatCreditsForWorkspace(
          workspace,
          execute,
          logger
        );
      },
      { concurrency: 4, wId: workspaceId, fromWorkspaceId }
    );
  }
);
