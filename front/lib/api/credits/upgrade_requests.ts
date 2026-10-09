import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { isUserBlocked } from "@app/lib/api/credits/access_control";
import { isEligibleForAutoSeatUpgrade } from "@app/lib/api/credits/auto_seat_upgrade";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import type { UserBlockedReason } from "@app/lib/metronome/user_block";
import { notifyUpgradeRequested } from "@app/lib/notifications/triggers/upgrade-request-created";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { hasAnyGroupPermission } from "@app/lib/resources/group_management_access";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  MembershipUpgradeRequestResource,
  UpgradeRequestReasonRequiredError,
} from "@app/lib/resources/membership_upgrade_request_resource";
import logger from "@app/logger/logger";
import type {
  MembershipUpgradeRequestCause,
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Map the live block reason to the request-cause snapshot stored on the row.
 * Near-limit (not yet blocked) and personal-cap blocks both become
 * `personal_limit`. Workspace pool exhaustion is not requestable via this
 * flow — it falls through to `personal_limit` only if a client posts anyway.
 */
export function upgradeRequestCauseFromBlockedReason(
  blockedReason: UserBlockedReason | null
): MembershipUpgradeRequestCause {
  switch (blockedReason) {
    case "group_shared_usage_limit_reached":
      return "group_shared_limit";
    case "no_seat":
      return "no_seat";
    case "user_cap_reached":
    case "credits_exhausted":
    case null:
      return "personal_limit";
    default:
      assertNever(blockedReason);
  }
}

type UpgradeRequestErrorType =
  | "workspace_not_metronome_billed"
  | "upgrade_requests_disabled"
  | "reason_required"
  | "user_not_found"
  | "request_not_found"
  | "request_not_pending"
  | "unauthorized"
  | "internal_error";

export class UpgradeRequestError extends Error {
  constructor(
    readonly type: UpgradeRequestErrorType,
    message: string
  ) {
    super(message);
  }
}

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

async function isUpgradeRequestReasonRequired(
  auth: Authenticator
): Promise<boolean> {
  const config =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);
  return config?.requireUpgradeRequestReason ?? false;
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

  const reasonRequired = await isUpgradeRequestReasonRequired(auth);

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

  const cause = upgradeRequestCauseFromBlockedReason(
    await isUserBlocked(auth, user)
  );

  const result = await MembershipUpgradeRequestResource.createPending(auth, {
    user,
    reason,
    reasonRequired,
    cause,
  });
  if (result.isErr()) {
    if (result.error instanceof UpgradeRequestReasonRequiredError) {
      return new Err(
        new UpgradeRequestError("reason_required", result.error.message)
      );
    }
    return new Err(
      new UpgradeRequestError("internal_error", result.error.message)
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
      cause: request.cause,
    },
  });

  void notifyManagersAndAdminsOfUpgradeRequest(auth, { request });

  return new Ok(request.toJSON());
}

type UpgradeRequestAvailability = {
  canRequestUpgrade: boolean;
  hasPendingUpgradeRequest: boolean;
  willAutoUpgrade: boolean;
  requireReason: boolean;
};

export async function getUpgradeRequestAvailabilityForUser(
  auth: Authenticator,
  { isNearOrAtLimit }: { isNearOrAtLimit: boolean }
): Promise<UpgradeRequestAvailability> {
  const unavailable: UpgradeRequestAvailability = {
    canRequestUpgrade: false,
    hasPendingUpgradeRequest: false,
    willAutoUpgrade: false,
    requireReason: false,
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
      requireReason: false,
    };
  }

  if (auth.isManager()) {
    return unavailable;
  }

  if (!(await isMemberUpgradeRequestAllowed(auth))) {
    return unavailable;
  }

  const [pending, requireReason] = await Promise.all([
    MembershipUpgradeRequestResource.getPendingForUser(auth, { user }),
    isUpgradeRequestReasonRequired(auth),
  ]);
  return {
    canRequestUpgrade: true,
    hasPendingUpgradeRequest: pending !== null,
    willAutoUpgrade: false,
    requireReason,
  };
}

// List pending requests within the caller's usage-limit scope.
export async function listPendingUpgradeRequests(
  auth: Authenticator,
  { groupId }: { groupId?: string } = {}
): Promise<MembershipUpgradeRequestType[]> {
  const requests =
    await MembershipUpgradeRequestResource.listPendingByWorkspace(auth, {
      groupId,
    });
  return requests.map((r) => r.toJSON());
}

// Record the outcome of an authorized request. The actual spend-limit / seat
// change is performed by the existing flows; this only marks the request.
export async function resolveUpgradeRequest(
  auth: Authenticator,
  {
    requestId,
    status,
    auditContext,
  }: {
    requestId: string;
    status: Exclude<MembershipUpgradeRequestStatus, "pending">;
    auditContext?: AuditLogContext;
  }
): Promise<Result<MembershipUpgradeRequestType, UpgradeRequestError>> {
  if (!(await hasAnyGroupPermission(auth, "set_usage_limits"))) {
    return new Err(
      new UpgradeRequestError(
        "unauthorized",
        "You cannot resolve upgrade requests."
      )
    );
  }
  const request = await MembershipUpgradeRequestResource.fetchById(
    auth,
    requestId
  );
  if (!request) {
    return new Err(
      new UpgradeRequestError("request_not_found", "Upgrade request not found.")
    );
  }

  const result = await request.markAsResolved(auth, { status });
  if (result.isErr()) {
    return new Err(
      new UpgradeRequestError(
        result.error,
        result.error === "unauthorized"
          ? "You can no longer resolve this request."
          : "Request is not pending."
      )
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
    metadata: {
      status,
      request_sid: request.sId,
      authorizing_group_id:
        result.value.kind === "group"
          ? result.value.group.sId
          : "workspace_role",
    },
  });

  return new Ok(request.toJSON());
}
