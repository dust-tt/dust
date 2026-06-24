/**
 * Backfill `memberships.seatType` to `"none"` for all active memberships in
 * non-credit-priced workspaces. For these workspaces `syncMetronomeSeat` never
 * runs, so the seat type has no billing meaning; `"none"` is the correct
 * default and avoids false positives in queries that filter on `seatType`.
 *
 * Idempotent: memberships already on `"none"` are counted but not re-written.
 *
 * Run with:
 *   npx tsx scripts/backfill_non_credit_membership_seat_type.ts [--execute]
 *   npx tsx scripts/backfill_non_credit_membership_seat_type.ts --wId <sId> [--execute]
 */

import { Op } from "sequelize";

import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipModel } from "@app/lib/resources/storage/models/membership";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { makeScript } from "@app/scripts/helpers";
import { runOnAllWorkspaces } from "@app/scripts/workspace_helpers";

makeScript(
  {
    wId: {
      type: "string",
      required: false,
      description: "Run on a single workspace (sId).",
    },
  },
  async ({ execute, wId }, logger) => {
    let totalWorkspaces = 0;
    let totalUpdated = 0;
    let totalAlreadyNone = 0;
    let totalSkippedCreditPriced = 0;

    await runOnAllWorkspaces(
      async (workspace) => {
        const subscription =
          await SubscriptionResource.fetchActiveByWorkspaceModelId(
            workspace.id
          );
        if (!subscription) {
          return;
        }

        const planCode = subscription.getPlan().code;
        if (isCreditPricedPlanPrefix(planCode)) {
          totalSkippedCreditPriced++;
          return;
        }

        totalWorkspaces++;

        const now = new Date();
        const toUpdateCount = await MembershipModel.count({
          where: {
            workspaceId: workspace.id,
            seatType: { [Op.ne]: "none" },
            endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: now }] },
          },
        });
        const alreadyNoneCount = await MembershipModel.count({
          where: {
            workspaceId: workspace.id,
            seatType: "none",
            endAt: { [Op.or]: [{ [Op.eq]: null }, { [Op.gt]: now }] },
          },
        });

        totalAlreadyNone += alreadyNoneCount;

        logger.info(
          {
            workspaceId: workspace.sId,
            planCode,
            toUpdate: toUpdateCount,
            alreadyNone: alreadyNoneCount,
          },
          execute
            ? "Resetting active memberships to seatType=none"
            : "[DRY-RUN] Would reset active memberships to seatType=none"
        );

        if (!execute || toUpdateCount === 0) {
          totalUpdated += toUpdateCount;
          return;
        }

        await MembershipResource.resetAllSeatsToNoneForWorkspace({ workspace });
        totalUpdated += toUpdateCount;
      },
      { wId }
    );

    logger.info(
      {
        totalWorkspaces,
        totalUpdated,
        totalAlreadyNone,
        totalSkippedCreditPriced,
        execute,
      },
      execute ? "Backfill complete" : "[DRY-RUN] Backfill summary"
    );
  }
);
