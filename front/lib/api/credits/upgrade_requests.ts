import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { isEligibleForAutoSeatUpgrade } from "@app/lib/api/credits/auto_seat_upgrade";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import { getMembers } from "@app/lib/api/workspace";
import type { Authenticator } from "@app/lib/auth";
import { notifyAdminsUpgradeRequested } from "@app/lib/notifications/workflows/upgrade-request-created";
import { isCreditPricedPlanPrefix } from "@app/lib/plans/plan_codes";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import logger from "@app/logger/logger";
import type {
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type UpgradeRequestErrorType =
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

async function notifyAdminsOfUpgradeRequest(
  auth: Authenticator,
  { request }: { request: MembershipUpgradeRequestResource }
): Promise<void> {
  //swallow errors
  try {
    if (!(await isUpgradeRequestEmailEnabled(auth))) {
      return;
    }

    const workspace = auth.getNonNullableWorkspace();
    const { members: admins } = await getMembers(auth, {
      roles: ["admin"],
      activeOnly: true,
    });

    const requester = request.requester;
    notifyAdminsUpgradeRequested({
      admins: admins.map((admin) => ({
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
  { auditContext }: { auditContext?: AuditLogContext } = {}
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
    metadata: { request_sid: request.sId },
  });

  void notifyAdminsOfUpgradeRequest(auth, { request });

  return new Ok(request.toJSON());
}

export type UpgradeRequestAvailability = {
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

  if (auth.isAdmin()) {
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

// Admin-only: record the outcome of a request. The actual spend-limit / seat
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
  const request = await MembershipUpgradeRequestResource.fetchById(
    auth,
    requestId
  );
  if (!request) {
    return new Err(
      new UpgradeRequestError("request_not_found", "Upgrade request not found.")
    );
  }

  const resolvedByUser = auth.getNonNullableUser();
  const result = await request.markAsResolved(auth, { status, resolvedByUser });
  if (result.isErr()) {
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
    metadata: { status, request_sid: request.sId },
  });

  return new Ok(request.toJSON());
}
