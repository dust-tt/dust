/**
 * Cross-reference active pro/max members against Metronome's live seat
 * balances, queried by explicit seat_ids (the reliable method — see the doc
 * comment on listMetronomeSeatBalances in lib/metronome/client.ts: the
 * unfiltered "list all seats" call silently omits most seats on large
 * contracts, so this always filters).
 *
 * Prints exactly which users have no live seat balance in Metronome and
 * their seat type. Metronome API errors for individual bad seat_ids (e.g.
 * "not found in contract subscriptions") are logged as warnings by
 * listMetronomeSeatBalances itself — those are expected noise, the final
 * "[debug] Result" line is the answer.
 *
 * Read-only.
 *
 *   npx tsx scripts/debug_seat_balances.ts --workspaceId <wId>
 *   npx tsx scripts/debug_seat_balances.ts --workspaceId <wId> --userId <uId>
 */
import { listMetronomeSeatBalances } from "@app/lib/metronome/client";
import { getCreditTypeAwuId } from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";

import { makeScript } from "./helpers";

makeScript(
  {
    workspaceId: { alias: "w", type: "string" as const, demandOption: true },
    userId: { alias: "u", type: "string" as const, demandOption: false },
  },
  async ({ workspaceId, userId }, logger) => {
    const workspace = await WorkspaceResource.fetchById(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found");
      return;
    }

    const metronomeCustomerId = workspace.metronomeCustomerId ?? undefined;
    const subscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    const metronomeContractId = subscription?.metronomeContractId ?? undefined;

    if (!metronomeCustomerId || !metronomeContractId) {
      logger.error(
        { workspaceId, metronomeCustomerId, metronomeContractId },
        "Workspace has no metronomeCustomerId or no active subscription with a metronomeContractId"
      );
      return;
    }

    const awuCreditTypeId = getCreditTypeAwuId();

    if (userId) {
      const result = await listMetronomeSeatBalances({
        metronomeCustomerId,
        metronomeContractId,
        seatIds: [userId],
      });
      if (result.isErr()) {
        logger.error({ err: result.error }, "[debug] Query failed");
        return;
      }
      const seat = result.value.find((s) => s.seat_id === userId);
      const awu = seat?.balances.find(
        (b) => b.credit_type_id === awuCreditTypeId
      );
      logger.info(
        { userId, found: !!seat, awu: awu ?? null },
        "[debug] Result for userId"
      );
      return;
    }

    // Only pro/max (and their _yearly variants) carry an individual
    // Metronome seat balance — free is a per-user credit (different
    // Metronome object), and "none"/"workspace" seats have no per-seat
    // balance at all.
    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace: renderLightWorkspaceType({ workspace }),
    });
    const seatBalanceEligible = new Set([
      "pro",
      "pro_yearly",
      "max",
      "max_yearly",
    ]);
    const eligibleMembers = memberships
      .filter((m) => m.user?.sId && seatBalanceEligible.has(m.seatType))
      .map((m) => ({ userId: m.user!.sId, seatType: m.seatType }));

    const result = await listMetronomeSeatBalances({
      metronomeCustomerId,
      metronomeContractId,
      seatIds: eligibleMembers.map((m) => m.userId),
    });
    if (result.isErr()) {
      logger.error({ err: result.error }, "[debug] Query failed");
      return;
    }

    const foundSeatIds = new Set(result.value.map((s) => s.seat_id));
    const missing = eligibleMembers.filter((m) => !foundSeatIds.has(m.userId));

    logger.info(
      {
        eligibleMembers: eligibleMembers.length,
        foundCount: foundSeatIds.size,
        missingCount: missing.length,
        missing,
      },
      "[debug] Result: pro/max members with no live seat balance in Metronome"
    );
  }
);
