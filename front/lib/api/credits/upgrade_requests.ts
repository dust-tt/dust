import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import type { AuditLogContext } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { MembershipUpgradeRequestResource } from "@app/lib/resources/membership_upgrade_request_resource";
import type {
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type UpgradeRequestErrorType =
  | "workspace_not_metronome_billed"
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

export type GetUpgradeRequestsResponseBody = {
  requests: MembershipUpgradeRequestType[];
};

export type PostUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};

export type PatchUpgradeRequestResponseBody = {
  request: MembershipUpgradeRequestType;
};

// Member-initiated: create (or return the already-pending) upgrade request for
// the current user. Gated on the workspace being credit-priced and the member
// actually being near/at their limit.
export async function createUpgradeRequest(
  auth: Authenticator,
  { auditContext }: { auditContext?: AuditLogContext } = {}
): Promise<Result<MembershipUpgradeRequestType, UpgradeRequestError>> {
  if (!auth.getNonNullableSubscriptionResource().isMetronomeOnlyBilled) {
    return new Err(
      new UpgradeRequestError(
        "workspace_not_metronome_billed",
        "Upgrade requests are only available on credit-priced workspaces."
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

  // TODO(upgrade-requests PR5): notify workspace admins by email (gated on the
  // `upgradeRequestEmail` notification toggle).

  return new Ok(request.toJSON());
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
