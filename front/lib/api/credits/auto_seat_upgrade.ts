import {
  buildAuditLogTarget,
  emitAuditLogEventDirect,
} from "@app/lib/api/audit/workos_audit";
import { updateMembershipSeatAndTrack } from "@app/lib/api/membership";
import { getMembers } from "@app/lib/api/workspace";
import { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { notifyAdminsSeatAutoUpgraded } from "@app/lib/notifications/workflows/seat-auto-upgraded";
import {
  isCreditPricedFreePlan,
  isCreditPricedPlanPrefix,
} from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import type { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { MembershipSeatType } from "@app/types/memberships";
import { toBaseSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

// Allowed auto-upgrade transitions, keyed on the *base* seat tier of the
// member's current seat. The value is the base tier we try to move them to,
// constrained to seats the workspace's contract actually offers (see
// `resolveAutoUpgradeTarget`). Anything not listed here (already at `max` or
// `workspace`) is a no-op.
const AUTO_UPGRADE_TARGET_BASE_TIER: Partial<
  Record<MembershipSeatType, MembershipSeatType>
> = {
  none: "workspace",
  free: "pro",
  pro: "max",
};

/**
 * Whether the workspace's subscription allows auto-upgrades to incur cost:
 * Metronome-billed on a non-free credit-priced plan. (The same gate the member
 * upgrade-request flow uses, plus the explicit non-free check.)
 */
export function passesBillingGate(subscription: SubscriptionResource): boolean {
  if (!subscription.isMetronomeOnlyBilled) {
    return false;
  }
  const planCode = subscription.getPlan().code;
  if (!isCreditPricedPlanPrefix(planCode)) {
    return false;
  }
  return !isCreditPricedFreePlan(planCode);
}

/**
 * Resolve the concrete seat type a member should be auto-upgraded to, or `null`
 * when no upgrade applies. The target base tier comes from
 * `AUTO_UPGRADE_TARGET_BASE_TIER`; the concrete seat type must be entitled by
 * the workspace's active contract ("stay in the allowed seats"). When both the
 * monthly and yearly cadence of the target tier are entitled, the monthly
 * variant is preferred.
 */
export async function resolveAutoUpgradeTarget(
  workspaceId: string,
  currentSeatType: MembershipSeatType | null | undefined
): Promise<MembershipSeatType | null> {
  if (!currentSeatType) {
    return null;
  }

  const targetBaseTier =
    AUTO_UPGRADE_TARGET_BASE_TIER[toBaseSeatType(currentSeatType)];
  if (!targetBaseTier) {
    return null;
  }

  const contract = await getActiveContract(workspaceId);
  if (!contract) {
    return null;
  }

  const productSeatTypes = await getProductSeatTypes();
  const entitledSeats = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );

  // Find an entitled seat whose base tier matches the target, preferring the
  // monthly cadence (the base tier itself) over the `_yearly` variant.
  let fallback: MembershipSeatType | null = null;
  for (const seatType of entitledSeats.keys()) {
    if (toBaseSeatType(seatType) !== targetBaseTier) {
      continue;
    }
    if (seatType === targetBaseTier) {
      return seatType;
    }
    fallback = seatType;
  }
  return fallback;
}

/**
 * Whether the given workspace+member is currently eligible for an automatic
 * seat upgrade: the toggle is on, the billing gate passes, and the member's
 * seat has an entitled higher tier. Used to suppress the member "request
 * upgrade" CTA (an eligible member will be auto-upgraded rather than needing to
 * ask). Read-only; returns `false` on any missing prerequisite.
 */
export async function isEligibleForAutoSeatUpgrade(
  auth: Authenticator
): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config?.autoSeatUpgradeEnabled) {
    return false;
  }

  const subscription = auth.subscriptionResource();
  if (!subscription || !passesBillingGate(subscription)) {
    return false;
  }

  const user = auth.user();
  if (!user) {
    return false;
  }

  const workspace = auth.getNonNullableWorkspace();
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return false;
  }

  const target = await resolveAutoUpgradeTarget(
    workspace.sId,
    membership.seatType
  );
  return target !== null;
}

/**
 * Auto-upgrade a member's seat one tier when they hit their credit limit, if
 * the workspace has opted in. No-ops unless: the toggle is on, the workspace is
 * Metronome-billed on a non-free plan, and the member's seat has an entitled
 * higher tier. The seat-count limit is intentionally bypassed (the upgrade may
 * make the subscription more expensive). On success, notifies admins and emits
 * an audit event.
 *
 * Fire-and-forget at the call sites; returns a `Result` for testability but
 * swallows Metronome failures into an `Ok` no-op so the credit-state path is
 * never broken by an upgrade attempt.
 */
export async function maybeAutoUpgradeSeat({
  workspaceId,
  userId,
}: {
  workspaceId: string;
  userId: string;
}): Promise<Result<{ upgraded: boolean }, Error>> {
  // The caller's auth can't mutate seats (member, or no user at all). This only
  // reads workspace data, we can take a builder only.
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (!config?.autoSeatUpgradeEnabled) {
    return new Ok({ upgraded: false });
  }

  const subscription = auth.subscriptionResource();
  if (!subscription || !passesBillingGate(subscription)) {
    return new Ok({ upgraded: false });
  }

  const user = await UserResource.fetchById(userId);
  if (!user) {
    return new Ok({ upgraded: false });
  }

  const lightWorkspace = auth.getNonNullableWorkspace();
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace: lightWorkspace,
    });
  if (!membership) {
    return new Ok({ upgraded: false });
  }

  const newSeatType = await resolveAutoUpgradeTarget(
    workspaceId,
    membership.seatType
  );
  if (!newSeatType) {
    return new Ok({ upgraded: false });
  }

  const result = await updateMembershipSeatAndTrack({
    user,
    workspace: lightWorkspace,
    newSeatType,
    author: "no-author",
  });
  if (result.isErr()) {
    logger.warn(
      {
        workspaceId,
        userId,
        currentSeatType: membership.seatType,
        newSeatType,
        error: result.error.type,
      },
      "[AutoSeatUpgrade] Failed to upgrade member seat"
    );
    return new Ok({ upgraded: false });
  }

  const { previousSeatType, newSeatType: appliedSeatType } = result.value;
  if (previousSeatType === appliedSeatType) {
    return new Ok({ upgraded: false });
  }

  logger.info(
    {
      workspaceId,
      userId,
      previousSeatType,
      newSeatType: appliedSeatType,
    },
    "[AutoSeatUpgrade] Upgraded member seat after credit limit hit"
  );

  void emitAuditLogEventDirect({
    workspace: lightWorkspace,
    action: "membership.seat_auto_upgraded",
    actor: { type: "system", id: "auto-seat-upgrade", name: "Dust" },
    targets: [
      buildAuditLogTarget("workspace", lightWorkspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() || "unknown",
      }),
    ],
    context: { location: "internal" },
    metadata: {
      previous_seat_type: previousSeatType,
      new_seat_type: appliedSeatType,
    },
  });

  void notifyAdmins({
    auth,
    workspace: lightWorkspace,
    member: {
      sId: user.sId,
      name: user.fullName() || user.username,
      email: user.email,
    },
    previousSeatType,
    newSeatType: appliedSeatType,
  });

  return new Ok({ upgraded: true });
}

async function notifyAdmins({
  auth,
  workspace,
  member,
  previousSeatType,
  newSeatType,
}: {
  auth: Authenticator;
  workspace: LightWorkspaceType;
  member: { sId: string; name: string; email: string | null };
  previousSeatType: MembershipSeatType;
  newSeatType: MembershipSeatType;
}): Promise<void> {
  try {
    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });
    notifyAdminsSeatAutoUpgraded({
      admins: admins.map((admin) => ({
        sId: admin.sId,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      })),
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      memberId: member.sId,
      memberName: member.name,
      memberEmail: member.email,
      previousSeatType,
      newSeatType,
    });
  } catch (err) {
    logger.error(
      { err, workspaceId: workspace.sId, memberId: member.sId },
      "[AutoSeatUpgrade] Failed to notify admins of seat auto-upgrade"
    );
  }
}
