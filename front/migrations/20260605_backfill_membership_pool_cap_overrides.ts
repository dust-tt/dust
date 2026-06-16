import { listMetronomePerUserCapsForWorkspace } from "@app/lib/metronome/alerts/spend_limits";
import { getSeatAllowancesByNormalizedSeatType } from "@app/lib/metronome/seat_types";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";
import { normalizeToPoolLimitSeatType } from "@app/types/memberships";

/**
 * Backfill `memberships.poolCapOverrideAwuCredits` from the existing Metronome
 * per-user cap alerts. The alert threshold is the total cap (pool override +
 * seat allowance); we subtract the current seat allowance to recover the
 * pool-only value the admin entered, which is what the column stores.
 *
 * Idempotent: memberships already carrying the expected value are skipped.
 *
 * Pass `--wId <workspaceId>` to run on a single workspace.
 */
makeScript(
  {
    wId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
  },
  async ({ execute, wId }, logger) => {
    let updated = 0;
    let alreadySet = 0;
    let skipped = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const { metronomeCustomerId } = workspace;
        if (!metronomeCustomerId) {
          return;
        }

        const capsResult = await listMetronomePerUserCapsForWorkspace({
          metronomeCustomerId,
          workspaceId: workspace.sId,
        });
        if (capsResult.isErr()) {
          logger.error(
            { workspaceId: workspace.sId, err: capsResult.error },
            "Failed to list per-user cap alerts; skipping workspace."
          );
          return;
        }
        const caps = capsResult.value;
        if (caps.size === 0) {
          return;
        }

        const seatAllowances = await getSeatAllowancesByNormalizedSeatType(
          workspace.sId
        );

        const users = await UserResource.fetchByIds([...caps.keys()]);
        const userById = new Map(users.map((u) => [u.sId, u]));
        const { memberships } = await MembershipResource.getActiveMemberships({
          workspace,
          users,
        });
        const membershipByUserModelId = new Map(
          memberships.map((m) => [m.userId, m])
        );

        for (const [userId, entry] of caps) {
          const user = userById.get(userId);
          const membership = user
            ? membershipByUserModelId.get(user.id)
            : undefined;
          if (!membership) {
            logger.warn(
              { workspaceId: workspace.sId, userId },
              "Per-user cap alert without an active membership; skipping."
            );
            skipped++;
            continue;
          }

          const normalizedSeatType = normalizeToPoolLimitSeatType(
            membership.seatType
          );
          const seatAllowance = normalizedSeatType
            ? (seatAllowances[normalizedSeatType] ?? 0)
            : 0;
          const poolCapOverrideAwuCredits =
            entry.alert.threshold - seatAllowance;
          if (poolCapOverrideAwuCredits < 0) {
            logger.warn(
              {
                workspaceId: workspace.sId,
                userId,
                threshold: entry.alert.threshold,
                seatAllowance,
              },
              "Alert threshold below seat allowance; skipping."
            );
            skipped++;
            continue;
          }

          if (
            membership.poolCapOverrideAwuCredits === poolCapOverrideAwuCredits
          ) {
            alreadySet++;
            continue;
          }

          logger.info(
            {
              workspaceId: workspace.sId,
              userId,
              threshold: entry.alert.threshold,
              seatAllowance,
              poolCapOverrideAwuCredits,
              previous: membership.poolCapOverrideAwuCredits,
            },
            execute
              ? "Backfilling pool cap override."
              : "Would backfill pool cap override."
          );
          if (execute) {
            await membership.updatePoolCapOverride(poolCapOverrideAwuCredits);
          }
          updated++;
        }
      },
      { wId }
    );

    logger.info(
      { updated, alreadySet, skipped },
      execute ? "Backfill completed." : "Dry run completed."
    );
  }
);
