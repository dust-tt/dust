import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { calculateFreeCreditAmountMicroUsd } from "@app/lib/credits/free";
import {
  createMetronomeCredit,
  getMetronomeActiveContract,
} from "@app/lib/metronome/client";
import {
  getCreditTypeProgrammaticUsdId,
  getProductFreeMonthlyCreditId,
} from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * Grant monthly free programmatic credits to a Metronome-billed workspace.
 * Uses the same bracket formula as the Stripe credit system.
 * Idempotent via uniqueness_key: free-legacy-{workspaceSId}-{YYYY-MM}.
 */
export async function grantMetronomeFreeCredits({
  workspace,
  startDate,
  endDate,
}: {
  workspace: WorkspaceResource;
  startDate: Date;
  endDate: Date;
}): Promise<void> {
  if (!workspace.metronomeCustomerId) {
    return;
  }

  try {
    // Resolve the active contract.
    const contractResult = await getMetronomeActiveContract(
      workspace.metronomeCustomerId
    );
    if (contractResult.isErr() || !contractResult.value) {
      logger.error(
        { workspaceId: workspace.sId },
        "[Metronome] No active Metronome contract found for free credit grant"
      );
      return;
    }

    const productId = getProductFreeMonthlyCreditId();

    // Count active members and compute bracket amount.
    const memberCount = await MembershipResource.countActiveSeatsInWorkspace(
      workspace.sId
    );
    const amountMicroUsd = calculateFreeCreditAmountMicroUsd(memberCount);
    if (amountMicroUsd <= 0) {
      return;
    }

    // Convert micro-USD to cents (Metronome credits are in cents).
    const amount = Math.ceil(amountMicroUsd / 10_000_000);

    const monthKey = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, "0")}`;

    const result = await createMetronomeCredit({
      metronomeCustomerId: workspace.metronomeCustomerId,
      productId,
      creditTypeId: getCreditTypeProgrammaticUsdId(),
      amount,
      startingAt: startDate.toISOString(),
      endingBefore: endDate.toISOString(),
      name: `Free Monthly Credits (${memberCount} users, ${monthKey})`,
      idempotencyKey: `free-legacy-${workspace.sId}-${monthKey}`,
    });

    if (result.isOk()) {
      logger.info(
        {
          workspaceId: workspace.sId,
          memberCount,
          amount,
          monthKey,
        },
        "[Metronome] Metronome free credits granted"
      );
      void emitAuditLogEventDirect({
        workspace: renderLightWorkspaceType({ workspace }),
        action: "credit.granted",
        actor: { type: "system", id: "metronome-webhook" },
        targets: [buildAuditLogTarget("workspace", workspace)],
        context: { location: "internal" },
        metadata: {
          amount: String(amount),
          memberCount: String(memberCount),
          monthKey,
          source: "metronome-commit-segment",
        },
      });
    }
  } catch (err) {
    logger.error(
      { workspaceId: workspace.sId, error: normalizeError(err) },
      "[Metronome] Failed to grant Metronome free credits"
    );
  }
}
