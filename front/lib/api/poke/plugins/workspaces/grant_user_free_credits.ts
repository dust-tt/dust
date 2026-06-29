import { createPlugin } from "@app/lib/api/poke/types";
import { upsertPerUserCreditBalanceAlerts } from "@app/lib/metronome/alerts/per_user_credit_balance";
import {
  editCustomerCreditSegmentAmount,
  findPerUserCustomerCreditSegment,
} from "@app/lib/metronome/client";
import {
  CONTRACT_CREDIT_TYPE_FREE_SEAT,
  toFreeMetronomeUserId,
} from "@app/lib/metronome/constants";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { isCreditPricedPlan } from "@app/types/plan";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const GrantUserFreeCreditsArgsSchema = z
  .object({
    userId: z.string().min(1, "User sId is required"),
    amountCredits: z
      .number()
      .int("Amount must be a whole number of credits")
      .positive("Amount must be greater than 0")
      .finite("Amount must be a valid number"),
    confirm: z.boolean(),
  })
  .refine((data) => data.confirm === true, {
    message: "Please confirm by checking the confirmation box",
    path: ["confirm"],
  });

export const grantUserFreeCreditsPlugin = createPlugin({
  manifest: {
    id: "grant-user-free-credits",
    name: "Grant Free Credits to Member",
    description:
      "Grant additional free AWU credits to a specific workspace member on a " +
      "free seat. Raises the granted amount of the member's existing per-user " +
      "free-seat credit (no invoice, no second credit) and refreshes their " +
      "balance alerts.",
    resourceTypes: ["workspaces"],
    args: {
      userId: {
        type: "string",
        label: "User sId",
        description: "The sId of the member to grant free credits to.",
      },
      amountCredits: {
        type: "number",
        variant: "text",
        label: "Amount (AWU credits)",
        description: "Number of free AWU credits to add to the member.",
      },
      confirm: {
        type: "boolean",
        label: "⚠️ Confirm grant",
        description:
          "I confirm that I want to grant these free credits to the member. " +
          "Free credits are given for free (no invoice).",
      },
    },
    requiredRoles: ["billing"],
  },
  isApplicableTo: (auth) => {
    const plan = auth.plan();
    return plan !== null && isCreditPricedPlan(plan);
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const validationResult = GrantUserFreeCreditsArgsSchema.safeParse(args);
    if (!validationResult.success) {
      return new Err(new Error(fromError(validationResult.error).toString()));
    }
    const { userId, amountCredits } = validationResult.data;

    const { metronomeCustomerId } = workspace;
    if (!metronomeCustomerId) {
      return new Err(
        new Error(
          `Workspace "${workspace.name}" is not provisioned in Metronome.`
        )
      );
    }

    const user = await UserResource.fetchById(userId);
    if (!user) {
      return new Err(new Error(`User not found: userId='${userId}'`));
    }

    const { memberships } = await MembershipResource.getActiveMemberships({
      workspace,
      users: [user],
    });
    const membership = memberships.find((m) => m.userId === user.id);
    if (!membership) {
      return new Err(
        new Error(
          `User "${user.email ?? userId}" is not an active member of "${workspace.name}".`
        )
      );
    }
    if (membership.seatType !== "free") {
      return new Err(
        new Error(
          `Free credits only apply to free seats; "${user.email ?? userId}" is on a "${membership.seatType ?? "none"}" seat.`
        )
      );
    }

    // The free-seat per-user credit is keyed by the free-prefixed Metronome user
    // id (usage for free-seat members is emitted under "free-<sId>"). A member
    // holds exactly one such credit; we raise its granted amount by editing the
    // access-schedule segment (not a ledger entry), so the credit's *total* — and
    // every display derived from it — reflects the new allowance.
    const metronomeUserId = toFreeMetronomeUserId(userId);

    const segmentResult = await findPerUserCustomerCreditSegment({
      metronomeCustomerId,
      contractCreditType: CONTRACT_CREDIT_TYPE_FREE_SEAT,
      userId: metronomeUserId,
    });
    if (segmentResult.isErr()) {
      return new Err(segmentResult.error);
    }
    if (!segmentResult.value) {
      return new Err(
        new Error(
          `No active free-seat credit found for "${user.email ?? userId}". ` +
            "Reconcile the workspace seats first so the member's free credit exists."
        )
      );
    }
    const { creditId, segmentId, segmentAmountAwu, startingBalanceAwu } =
      segmentResult.value;

    const newAllowanceAwu = startingBalanceAwu + amountCredits;

    const editResult = await editCustomerCreditSegmentAmount({
      metronomeCustomerId,
      creditId,
      segmentId,
      amount: segmentAmountAwu + amountCredits,
    });
    if (editResult.isErr()) {
      logger.error(
        {
          workspaceId: workspace.sId,
          userId,
          creditId,
          amountCredits,
          error: editResult.error.message,
        },
        "[Poke Plugin] Failed to grant free credits to member"
      );
      return new Err(editResult.error);
    }

    // Best-effort: refresh the per-user balance alerts so the low-balance
    // threshold tracks the new total allowance. A failure here does not undo the
    // grant.
    const alertResult = await upsertPerUserCreditBalanceAlerts({
      metronomeCustomerId,
      workspaceId: workspace.sId,
      userId: metronomeUserId,
      allowanceAwu: newAllowanceAwu,
    });
    if (alertResult.isErr()) {
      logger.warn(
        {
          workspaceId: workspace.sId,
          userId,
          error: alertResult.error.message,
        },
        "[Poke Plugin] Granted free credits but failed to refresh balance alerts"
      );
    }

    return new Ok({
      display: "text",
      value: `Granted ${amountCredits.toLocaleString()} free AWU credits to ${user.email ?? userId}. New total free allowance: ${newAllowanceAwu.toLocaleString()} credits.`,
    });
  },
});
