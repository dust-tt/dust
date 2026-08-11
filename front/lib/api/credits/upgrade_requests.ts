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
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { UpgradeRequestResolution } from "@app/types/api/credits/upgrade_requests";
import type {
  MembershipUpgradeRequestStatus,
  MembershipUpgradeRequestType,
} from "@app/types/memberships";
import type { ModelId } from "@app/types/shared/model_id";
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

// Admin-only: paginated upgrade requests for the workspace
export const UPGRADE_REQUESTS_PAGE_SIZE = 100;

// The requester isn't joined in SQL so a name/email search
// resolves matching users via the user search index first, then restricts the
// resource query to their ids. Returns `null` when the search matched no one,
// meaning callers should return an empty result rather than an unfiltered one.
async function resolveSearchUserModelIds(
  auth: Authenticator,
  search: string | undefined
): Promise<number[] | undefined | null> {
  if (!search || search.trim().length === 0) {
    return undefined;
  }
  const searchResult = await UserResource.searchAllUsers(auth, {
    searchTerm: search.trim(),
  });
  if (searchResult.isErr()) {
    throw searchResult.error;
  }
  const userModelIds = searchResult.value.users.map((u) => u.id);
  return userModelIds.length === 0 ? null : userModelIds;
}

export async function listUpgradeRequests(
  auth: Authenticator,
  {
    status,
    offset,
    decision,
    search,
  }: {
    status: "pending" | "resolved";
    offset: number;
    decision?: Exclude<MembershipUpgradeRequestStatus, "pending">;
    search?: string;
  }
): Promise<{ requests: MembershipUpgradeRequestType[]; total: number }> {
  const userModelIds = await resolveSearchUserModelIds(auth, search);
  if (userModelIds === null) {
    return { requests: [], total: 0 };
  }

  const { requests, total } =
    await MembershipUpgradeRequestResource.listByWorkspace(auth, {
      status,
      limit: UPGRADE_REQUESTS_PAGE_SIZE,
      offset,
      decision,
      userModelIds,
    });
  return { requests: requests.map((r) => r.toJSON()), total };
}

// Admin-only: every upgrade request matching the current filters. Keyset
// (not offset) pagination so a request created/resolved concurrently
// mid-export can't shift page boundaries and duplicate or drop a row.
export async function listAllUpgradeRequests(
  auth: Authenticator,
  {
    status,
    decision,
    search,
  }: {
    status: "pending" | "resolved";
    decision?: Exclude<MembershipUpgradeRequestStatus, "pending">;
    search?: string;
  }
): Promise<MembershipUpgradeRequestType[]> {
  const userModelIds = await resolveSearchUserModelIds(auth, search);
  if (userModelIds === null) {
    return [];
  }

  const allRequests: MembershipUpgradeRequestType[] = [];
  let after: { sortKey: Date; id: ModelId } | null = null;
  while (true) {
    const requests =
      await MembershipUpgradeRequestResource.listByWorkspaceAfter(auth, {
        status,
        limit: UPGRADE_REQUESTS_PAGE_SIZE,
        after,
        decision,
        userModelIds,
      });
    allRequests.push(...requests.map((r) => r.toJSON()));
    if (requests.length < UPGRADE_REQUESTS_PAGE_SIZE) {
      break;
    }
    const last = requests[requests.length - 1];
    const sortKey =
      status === "pending" ? last.createdAt : (last.resolvedAt ?? new Date(0));
    after = { sortKey, id: last.id };
  }
  return allRequests;
}

// Admin-only: record the outcome of a request. The request is claimed first
// via a compare-and-set on `status = 'pending'` — see `markAsResolved` — so
// that two admins resolving the same request concurrently can't both apply
// conflicting side effects: only the admin whose CAS observes `pending`
// proceeds past the claim. An approval that carries a `limit` then syncs the
// requester's spend limit; if that sync fails, the claim is rolled back via
// `revertToPending` so the request remains resolvable instead of being stuck
// approved with no limit ever applied. `grantedSeatType`, when resolved via
// "Upgrade to max plan", and the spend-limit grant (recorded inside
// `setUserSpendLimit`) are snapshotted onto the request for the history view.
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

  // Claim the request first: compare-and-set on `status = 'pending'`. If
  // another admin resolved this request concurrently between the fetch above
  // and here, this fails rather than letting both admins' side effects below
  // race against each other.
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
      "[UpgradeRequest] Request was resolved concurrently by another admin"
    );
    return new Err(
      new UpgradeRequestError("request_not_pending", result.error.message)
    );
  }

  if (resolution.status === "approved" && resolution.limit) {
    const spendLimitResult = await setUserSpendLimit(auth, {
      userId: request.requester.sId,
      limit: resolution.limit,
      auditContext: auditContext ?? { location: "internal" },
      requestId: request.sId,
    });
    if (spendLimitResult.isErr()) {
      // The claim succeeded but applying the limit failed (e.g. a Metronome
      // sync error): roll the claim back so the request stays pending and
      // this (or another) resolution attempt can retry it.
      await request.revertToPending();
      return new Err(spendLimitResult.error);
    }
  }

  if (resolution.status === "approved" && resolution.grantedSeatType) {
    await request.recordSeatUpgrade(resolution.grantedSeatType);
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
