/**
 * Correct a batch of memberships to a target seat type, backdated to a manual
 * effective date, then push the corrected seat counts to Metronome as of that
 * same date (correcting the historical segment instead of only from now on).
 *
 * Use case: seats were wrongly force-promoted onto a seat type they were never
 * entitled to (see `stagePendingContractSeats` legacy-Pro scoping) and need to
 * be reverted retroactively to the date they were wrongly changed.
 *
 * CSV format (from `--csvPath`): one column, header "email", one address per row.
 *
 * Run with:
 *   npx tsx scripts/backdate_membership_seat_types_from_csv.ts \
 *     --wId <workspaceSId> --csvPath <path> --seatType <free|workspace|pro|max|none> \
 *     --effectiveDate <ISO date> [--execute]
 */

import { reconcileUser } from "@app/lib/api/metronome/reconcile_credit_state";
import { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { syncSeatCount } from "@app/lib/metronome/seats";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { makeScript } from "@app/scripts/helpers";
import {
  isMembershipSeatType,
  MEMBERSHIP_SEAT_TYPES,
} from "@app/types/memberships";
import { parse } from "csv-parse/sync";
import { readFileSync } from "fs";

const CSV_COL = { EMAIL: "email" } as const;

makeScript(
  {
    wId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId",
    },
    csvPath: {
      type: "string",
      demandOption: true,
      description: `Path to CSV with one "${CSV_COL.EMAIL}" column`,
    },
    seatType: {
      type: "string",
      demandOption: true,
      choices: [...MEMBERSHIP_SEAT_TYPES],
      description: "Target seat type to backdate every listed member onto",
    },
    effectiveDate: {
      type: "string",
      demandOption: true,
      description:
        "ISO date the seat change (and the Metronome segment correction) is backdated to",
    },
  },
  async ({ wId, csvPath, seatType, effectiveDate, execute }, logger) => {
    if (!isMembershipSeatType(seatType)) {
      logger.error({ seatType }, "Invalid seat type");
      return;
    }

    const effectiveAt = new Date(effectiveDate);
    if (Number.isNaN(effectiveAt.getTime())) {
      logger.error({ effectiveDate }, "Invalid effective date");
      return;
    }

    const rows: Array<Record<string, string>> = parse(
      readFileSync(csvPath, "utf-8"),
      { columns: true, skip_empty_lines: true, trim: true }
    );
    const emails = [
      ...new Set(
        rows
          .map((r) => r[CSV_COL.EMAIL]?.toLowerCase())
          .filter((e): e is string => !!e)
      ),
    ];
    if (emails.length === 0) {
      logger.error({ csvPath }, "No emails found in CSV");
      return;
    }

    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      logger.error({ wId }, "Workspace not found");
      return;
    }
    const lightWorkspace = renderLightWorkspaceType({ workspace });
    if (!lightWorkspace.metronomeCustomerId) {
      logger.error({ wId }, "Workspace is not provisioned on Metronome");
      return;
    }

    const users = await UserResource.fetchByEmails(emails);
    const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
    const missingEmails = emails.filter((e) => !userByEmail.has(e));
    if (missingEmails.length > 0) {
      logger.warn(
        { missingEmails },
        "No user found for these emails — skipping"
      );
    }

    const targets: { user: UserResource; membership: MembershipResource }[] =
      [];
    for (const email of emails) {
      const user = userByEmail.get(email);
      if (!user) {
        continue;
      }
      const membership =
        await MembershipResource.getActiveMembershipOfUserInWorkspace({
          user,
          workspace: lightWorkspace,
        });
      if (!membership) {
        logger.warn({ email, wId }, "No active membership — skipping");
        continue;
      }
      logger.info(
        {
          email,
          currentSeatType: membership.seatType,
          newSeatType: seatType,
          effectiveAt: effectiveAt.toISOString(),
        },
        membership.seatType === seatType
          ? "Already on target seat type — no-op"
          : "Will backdate membership seat type"
      );
      if (membership.seatType !== seatType) {
        targets.push({ user, membership });
      }
    }

    if (!execute) {
      logger.info(
        { toChange: targets.length, total: emails.length },
        "Dry run — no changes applied"
      );
      return;
    }

    for (const { user, membership } of targets) {
      await membership.updateMembershipSeat({
        user,
        workspace: lightWorkspace,
        newSeatType: seatType,
        author: "no-author",
      });
    }

    const activeSubscription =
      await SubscriptionResource.fetchActiveByWorkspaceModelId(workspace.id);
    const activeContract = await getActiveContract(wId);
    if (!activeSubscription?.metronomeContractId || !activeContract) {
      logger.error(
        { wId },
        "No active Metronome contract — DB updated, Metronome NOT synced"
      );
      return;
    }

    const syncResult = await syncSeatCount({
      metronomeCustomerId: lightWorkspace.metronomeCustomerId,
      contractId: activeSubscription.metronomeContractId,
      workspace: lightWorkspace,
      planCode: activeSubscription.getPlan().code,
      contract: activeContract,
      startingAt: effectiveAt.toISOString(),
      // Same-contract correction (e.g. pro -> max): carry over consumed AWU
      // credit despite the backdated `startingAt`, same as an immediate move.
      carryConsumptionAcrossStartingAt: true,
    });
    if (syncResult.isErr()) {
      logger.error(
        { wId, err: syncResult.error.message },
        "Failed to push corrected seat counts to Metronome"
      );
      return;
    }
    logger.info(
      { wId, effectiveAt: effectiveAt.toISOString() },
      "Metronome seat counts corrected"
    );

    const auth = await Authenticator.internalAdminForWorkspace(wId);
    for (const { user } of targets) {
      const reconcileResult = await reconcileUser({
        auth,
        workspace,
        metronomeCustomerId: lightWorkspace.metronomeCustomerId,
        userId: user.sId,
        execute: true,
      });
      if (reconcileResult.isErr()) {
        logger.warn(
          { userId: user.sId, err: reconcileResult.error.message },
          "Credit-state reconcile failed for user; continuing"
        );
      }
    }

    logger.info({ changed: targets.length }, "Done");
  }
);
