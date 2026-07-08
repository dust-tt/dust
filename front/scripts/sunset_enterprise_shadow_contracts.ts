/**
 * Sunset all Metronome shadow contracts for legacy enterprise workspaces.
 *
 * A "shadow contract" is a subscription with both stripeSubscriptionId and
 * metronomeContractId set — Stripe owns billing, Metronome ran in parallel for
 * invoice comparison only. This script archives the Metronome contract (voiding
 * any draft invoices) and clears the metronomeContractId from the DB so the
 * workspace becomes cleanly Stripe-only billed.
 *
 * Only targets active subscriptions on ENT_ plans (legacy enterprise). CP_
 * plans are Metronome-only billed and are not touched.
 *
 * Dry-run by default. Pass --execute to apply changes.
 *
 * Run with:
 *   npx tsx scripts/sunset_enterprise_shadow_contracts.ts [--execute] [--workspaceId <sId>]
 */

import { archiveMetronomeContract } from "@app/lib/metronome/client";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import { PlanModel, SubscriptionModel } from "@app/lib/models/plan";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { Op } from "sequelize";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: {
      type: "string" as const,
      describe: "Restrict to a single workspace sId",
      default: "",
    },
  },
  async ({ execute, workspaceId }, logger) => {
    const whereWorkspace = workspaceId ? { sId: workspaceId } : {};

    // Find all active shadow-billed subscriptions (both IDs set) on ENT_
    // (legacy enterprise) plans — CP_ENT_ plans are Metronome-only and are
    // excluded by the literal "ENT\_%" match (escaped so "_" isn't a SQL
    // wildcard).
    const enterpriseSubs = await SubscriptionModel.findAll({
      where: {
        status: "active",
        stripeSubscriptionId: { [Op.ne]: null },
        metronomeContractId: { [Op.ne]: null },
      },
      include: [
        {
          model: PlanModel,
          as: "plan",
          where: { code: { [Op.like]: "ENT\\_%" } },
          required: true,
        },
        {
          model: WorkspaceModel,
          as: "workspace",
          where: whereWorkspace,
          required: true,
        },
      ],
    });

    logger.info(
      { enterprise: enterpriseSubs.length },
      "Shadow contracts found"
    );

    for (const sub of enterpriseSubs) {
      const workspaceId = sub.workspace.sId;
      const metronomeCustomerId = sub.workspace.metronomeCustomerId;
      const contractId = sub.metronomeContractId!;

      logger.info(
        {
          workspaceId,
          planCode: sub.plan?.code,
          metronomeCustomerId,
          contractId,
        },
        execute
          ? "Archiving shadow contract"
          : "[DRY-RUN] Would archive shadow contract"
      );

      if (!execute) {
        continue;
      }

      if (!metronomeCustomerId) {
        logger.warn(
          { workspaceId },
          "No metronomeCustomerId on workspace, skipping"
        );
        continue;
      }

      const archiveResult = await archiveMetronomeContract({
        metronomeCustomerId,
        contractId,
        voidInvoices: true,
      });

      if (archiveResult.isErr()) {
        logger.error(
          {
            workspaceId,
            contractId,
            error: archiveResult.error.message,
          },
          "Failed to archive Metronome contract"
        );
        continue;
      }

      // Clear the contractId from the DB so the subscription becomes Stripe-only.
      await sub.update({ metronomeContractId: null });
      await invalidateContractCache(workspaceId);
      await SubscriptionResource.invalidateSubscriptionCache(sub.workspaceId);

      logger.info(
        { workspaceId, contractId },
        "Shadow contract archived and DB cleared"
      );
    }

    logger.info(
      { processed: enterpriseSubs.length, execute },
      execute ? "Done" : "Dry-run complete — pass --execute to apply"
    );
  }
);
