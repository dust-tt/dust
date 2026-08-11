import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { isEligibleForAutoSeatUpgrade } from "@app/lib/api/credits/auto_seat_upgrade";
import type { UserSpendLimitError } from "@app/lib/api/users/spend_limit";
import { setUserSpendLimit } from "@app/lib/api/users/spend_limit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { notifyUpgradeRequested } from "@app/lib/notifications/workflows/upgrade-request-created";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import logger from "@app/logger/logger";
import type { UpgradeRequestResolution } from "@app/types/api/credits/upgrade_requests";
import type { MembershipUpgradeRequestType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type UpgradeRequestErrorType =
  | "workspace_not_metronome_billed"
  | "upgrade_requests_disabled"
  | "user_not_found"
  | "request_not_found"
  | "request_not_pending";

export class UpgradeRequestError extends Error {
  constructor(
    readonly type: UpgradeRequestErrorType,
    message: string
  ) {
    super(message);
  }
}

export type ResolveUpgradeRequestError =
  | UpgradeRequestError
  | UserSpendLimitError;

async function isMemberUpgradeRequestAllowed(
  auth: Authenticator
): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config?.allowMemberUpgradeRequests ?? true;
}

async function isUpgradeRequestEmailEnabled(
  auth: Authenticator
): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config?.upgradeRequestEmailEnabled ?? true;
}

async function notifyManagersAndAdminsOfUpgradeRequest(
  auth: Authenticator,
  { request }: { request: MembershipUpgradeRequestResource }
): Promise<void> {
  //swallow errors
  try {
    if (!(await isUpgradeRequestEmailEnabled(auth))) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();
    const { members: usersToNotify } = await getMembers(auth, {
      roles: ["admin", "manager"],
      activeOnly: true,
    });

    const requester = request.requester;
    notifyUpgradeRequested({
      users: usersToNotify.map((admin) => ({
        sId: admin.sId,
        email: admin.email,
        firstName: admin.firstName,
        lastName: admin.lastName,
      })),
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      requestId: request.sId,
      requesterName: requester.fullName() ?? requester.name,
      requesterEmail: requester.email ?? null,
      reason: request.reason,
    });
  } catch (err) {
    logger.error(
      { err, requestId: request.sId },
      "Failed to notify admins of upgrade request"
    );
  }
}

// Member-initiated: create (or return the already-pending) upgrade request for
// the current user. Gated on the workspace being credit-priced and the member
// actually being near/at their limit.
export async function createUpgradeRequest(
  auth: Authenticator,
  {
    reason,
    auditContext,
  }: { reason: string | null; auditContext?: AuditLogContext }
): Promise<Result<MembershipUpgradeRequestType, UpgradeRequestError>> {
  const subscription = auth.getNonNullableSubscriptionResource();
  if (
    !subscription.isMetronomeOnlyBilled ||
    !isCreditPricedPlanPrefix(subscription.getPlan().code)
  ) {
    return new Err(
      new UpgradeRequestError(
        "workspace_not_metronome_billed",
        "Upgrade requests are only available on credit-priced workspaces."
      )
    );
  }

  if (!(await isMemberUpgradeRequestAllowed(auth))) {
    return new Err(
      new UpgradeRequestError(
        "upgrade_requests_disabled",
        "Member-initiated upgrade requests are disabled for this workspace."
      )
    );
  }

  const user = auth.user();
  if (!user) {
    return new Err(
      new UpgradeRequestError("user_not_found", "No authenticated user.")
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user,
      workspace,
    });
  if (!membership) {
    return new Err(
      new UpgradeRequestError(
        "user_not_found",
        "You are not an active member of this workspace."
      )
    );
  }

  const result = await MembershipUpgradeRequestResource.createPending(auth, {
    user,
    reason,
  });
  if (result.isErr()) {
    return new Err(
      new UpgradeRequestError("request_not_found", result.error.message)
    );
  }
  const request = result.value;

  void emitAuditLogEvent({
    auth,
    action: "membership.upgrade_request_created",
    targets: [
      buildAuditLogTarget("workspace", workspace),
      buildAuditLogTarget("user", {
        sId: user.sId,
        name: user.fullName() ?? "unknown",
      }),
    ],
    context: auditContext,
    metadata: {
      request_sid: request.sId,
      reason: request.reason ?? "",
    },
  });

  void notifyManagersAndAdminsOfUpgradeRequest(auth, { request });

  return new Ok(request.toJSON());
}

type UpgradeRequestAvailability = {
  canRequestUpgrade: boolean;
  hasPendingUpgradeRequest: boolean;
  willAutoUpgrade: boolean;
};

export async function getUpgradeRequestAvailabilityForUser(
  auth: Authenticator,
  { isNearOrAtLimit }: { isNearOrAtLimit: boolean }
): Promise<UpgradeRequestAvailability> {
  const unavailable: UpgradeRequestAvailability = {
    canRequestUpgrade: false,
    hasPendingUpgradeRequest: false,
    willAutoUpgrade: false,
  };

  const user = auth.user();
  if (!isNearOrAtLimit || !user) {
    return unavailable;
  }

  if (await isEligibleForAutoSeatUpgrade(auth)) {
    return {
      canRequestUpgrade: false,
      hasPendingUpgradeRequest: false,
      willAutoUpgrade: true,
    };
  }

  if (auth.isManager()) {
    return unavailable;
  }

  if (!(await isMemberUpgradeRequestAllowed(auth))) {
    return unavailable;
  }

  const pending = await MembershipUpgradeRequestResource.getPendingForUser(
    auth,
    { user }
  );
  return {
    canRequestUpgrade: true,
    hasPendingUpgradeRequest: pending !== null,
    willAutoUpgrade: false,
  };
}

// Admin-only: list pending upgrade requests for the workspace.
export async function listPendingUpgradeRequests(
  auth: Authenticator
): Promise<MembershipUpgradeRequestType[]> {
  const requests =
    await MembershipUpgradeRequestResource.listPendingByWorkspace(auth);
  return requests.map((r) => r.toJSON());
}

// Admin-only: record the outcome of a request.
export async function resolveUpgradeRequest(
  auth: Authenticator,
  {
    requestId,
    resolution,
    auditContext,
  }: {
    requestId: string;
    resolution: UpgradeRequestResolution;
    auditContext?: AuditLogContext;
  }
): Promise<Result<MembershipUpgradeRequestType, ResolveUpgradeRequestError>> {
  const request = await MembershipUpgradeRequestResource.fetchById(
    auth,
    requestId
  );
  if (!request) {
    return new Err(
      new UpgradeRequestError("request_not_found", "Upgrade request not found.")
    );
  }
  if (request.status !== "pending") {
    return new Err(
      new UpgradeRequestError(
        "request_not_pending",
        "Upgrade request is not pending."
      )
    );
  }

  // Apply the spend-limit change first, before flipping the request to
  // resolved. `setUserSpendLimit` is idempotent (it converges to the
  // requested limit however many times it's called), so if the process
  // crashes right after this call, the request is still visible as pending
  // and the next resolution attempt just re-applies the same limit and
  // succeeds. Doing this the other way around — resolving first — would
  // instead risk a crash leaving the request permanently "approved" with the
  // limit never actually applied.
  if (resolution.status === "approved" && resolution.limit) {
    const spendLimitResult = await setUserSpendLimit(auth, {
      userId: request.requester.sId,
      limit: resolution.limit,
      auditContext: auditContext ?? { location: "internal" },
    });
    if (spendLimitResult.isErr()) {
      return new Err(spendLimitResult.error);
    }
  }

  // Compare-and-set on `status = 'pending'`: if another admin resolved this
  // request concurrently between the fetch above and here, this fails rather
  // than silently overwriting their resolution.
  const resolvedByUser = auth.getNonNullableUser();
  const result = await request.markAsResolved(auth, {
    status: resolution.status,
    resolvedByUser,
  });
  if (result.isErr()) {
    logger.error(
      {
        requestId: request.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        resolutionStatus: resolution.status,
      },
      "[UpgradeRequest] Request was resolved concurrently by another admin after its spend limit was applied"
    );
    return new Err(
      new UpgradeRequestError("request_not_pending", result.error.message)
    );
  }

  void emitAuditLogEvent({
    auth,
    action: "membership.upgrade_request_resolved",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("user", {
        sId: request.requester.sId,
        name: request.requester.name,
      }),
    ],
    context: auditContext,
    metadata: { status: resolution.status, request_sid: request.sId },
  });

  return new Ok(request.toJSON());
}
