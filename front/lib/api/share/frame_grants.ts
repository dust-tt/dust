import type { AuditAction } from "@app/lib/api/audit/workos_audit";
import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import {
  checkFrameEmailGrantPermission,
  getFrameWorkspaceMemberEmails,
  notifyFrameSharingInvitations,
} from "@app/lib/api/share/frame_sharing";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FileViewerSummary } from "@app/lib/resources/file_viewer_queries";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { BaseError } from "sequelize";

export interface FrameSharingState {
  grants: SharingGrantResource[];
  viewers: FileViewerSummary[];
  blockedGrantIds: Set<string>;
  membersOnly: boolean;
  canGrantDomains: boolean;
}

async function canGrantFrameDomains(
  auth: Authenticator,
  membersOnly: boolean
): Promise<boolean> {
  return (
    !membersOnly &&
    (await auth.hasFeatureFlag("frame_domain_sharing")) &&
    (await auth.hasWorkspacePermission("invite", "frame"))
  );
}

async function frameRequiresMembership(
  auth: Authenticator,
  file: FileResource
): Promise<boolean> {
  return (
    auth.getNonNullableWorkspace().sharingPolicy === "workspace_only" ||
    (await file.hasActiveFrameFunctions())
  );
}

export async function listFrameSharing(
  auth: Authenticator,
  file: FileResource
): Promise<FrameSharingState> {
  const [grants, viewers, membersOnly] = await Promise.all([
    SharingGrantResource.listForFile(file),
    file.getViewerSummaries(),
    frameRequiresMembership(auth, file),
  ]);
  const blockedGrantIds = new Set<string>();
  if (membersOnly && grants.length > 0) {
    const emails = removeNulls(grants.map((grant) => grant.email));
    const memberEmails = await getFrameWorkspaceMemberEmails(auth, emails);
    for (const grant of grants) {
      if (grant.email === null || !memberEmails.has(grant.email)) {
        blockedGrantIds.add(grant.sId);
      }
    }
  }
  return {
    grants,
    viewers,
    blockedGrantIds,
    membersOnly,
    canGrantDomains: await canGrantFrameDomains(auth, membersOnly),
  };
}

function emitFrameGrantAuditEvent(
  auth: Authenticator,
  file: FileResource,
  action: AuditAction,
  metadata: Record<string, string>
): void {
  void emitAuditLogEvent({
    auth,
    action,
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      buildAuditLogTarget("frame", { sId: file.sId, name: file.fileName }),
    ],
    context: getAuditLogContext(auth),
    metadata: { frame_name: file.fileName, ...metadata },
  });
}

/**
 * @cc [owner:flvndvd,label:security] domain-invitation-permission
 * Domain grants require the rollout flag, invite-frame permission and a frame that allows external viewers.
 */
export async function addFrameSharingGrants(
  auth: Authenticator,
  file: FileResource,
  { emails = [], domains = [] }: { emails?: string[]; domains?: string[] }
): Promise<Result<FrameSharingState, DustError>> {
  if (
    domains.length > 0 &&
    !(await canGrantFrameDomains(
      auth,
      await frameRequiresMembership(auth, file)
    ))
  ) {
    return new Err(
      new DustError(
        "unauthorized",
        "You cannot share this frame with an email domain."
      )
    );
  }
  const permission = await checkFrameEmailGrantPermission(auth, emails, file);
  if (permission.isErr()) {
    return permission;
  }
  await file.ensureShareableFrame(auth);
  const created = await SharingGrantResource.add(auth, file, {
    emails,
    domains,
  });
  if (created.isErr()) {
    return created;
  }
  const createdEmails = removeNulls(created.value.map((grant) => grant.email));
  const createdDomains = removeNulls(
    created.value.map((grant) => grant.domain)
  );
  notifyFrameSharingInvitations(auth, file, createdEmails);
  if (createdEmails.length > 0) {
    emitFrameGrantAuditEvent(auth, file, "frame.email_grant_added", {
      emails: createdEmails.join(","),
    });
  }
  if (createdDomains.length > 0) {
    emitFrameGrantAuditEvent(auth, file, "frame.domain_grant_added", {
      domains: createdDomains.join(","),
    });
  }
  return new Ok(await listFrameSharing(auth, file));
}

export async function revokeFrameSharingGrant(
  auth: Authenticator,
  file: FileResource,
  grantId: string
): Promise<Result<void, DustError>> {
  const grant = await SharingGrantResource.fetchById(file, grantId);
  if (!grant) {
    return new Err(new DustError("file_not_found", "Sharing grant not found"));
  }
  const revoked = await grant.revoke();
  if (revoked.isErr()) {
    return revoked;
  }
  const target = grant.target;
  switch (target.kind) {
    case "email":
      emitFrameGrantAuditEvent(auth, file, "frame.email_grant_revoked", {
        email: target.value,
      });
      break;
    case "domain":
      emitFrameGrantAuditEvent(auth, file, "frame.domain_grant_revoked", {
        domain: target.value,
      });
      break;
    default:
      assertNever(target);
  }
  return new Ok(undefined);
}

/**
 * @cc [owner:flvndvd,label:error-handling] frame-view-recording-failures
 * This boundary may catch Sequelize errors from view recording so analytics cannot deny access.
 * Other exceptions must propagate.
 */
export async function recordFrameView(
  file: FileResource,
  grant: SharingGrantResource,
  verifiedEmail: string
): Promise<void> {
  const viewedAt = new Date();
  const results = await Promise.allSettled([
    file.recordView({ verifiedEmail, viewedAt }),
    grant.recordLegacyView({ viewedAt }),
  ]);
  for (const result of results) {
    if (result.status === "rejected") {
      if (!(result.reason instanceof BaseError)) {
        throw result.reason;
      }
      logger.warn(
        { error: result.reason, fileId: file.sId },
        "Failed to record shared file view"
      );
    }
  }
}
