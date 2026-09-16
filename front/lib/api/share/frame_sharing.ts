import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { FileViewerSummary } from "@app/lib/resources/file_viewer_queries";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { FileShareScope } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import { escape } from "html-escaper";
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
  { membersOnly }: { membersOnly: boolean }
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
  const canGrantDomains = await canGrantFrameDomains(auth, { membersOnly });
  return {
    grants,
    viewers,
    blockedGrantIds,
    membersOnly,
    canGrantDomains,
  };
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
  if (domains.length > 0) {
    const membersOnly = await frameRequiresMembership(auth, file);
    const canGrantDomains = await canGrantFrameDomains(auth, { membersOnly });
    if (!canGrantDomains) {
      return new Err(
        new DustError(
          "unauthorized",
          "You cannot share this frame with an email domain."
        )
      );
    }
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
  notifyFrameSharingInvitations(auth, file, createdEmails);
  const sharing = await listFrameSharing(auth, file);
  return new Ok(sharing);
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

export function getDefaultFrameShareScope(
  sharingPolicy: WorkspaceSharingPolicy
): FileShareScope {
  switch (sharingPolicy) {
    // TODO(2026-04-08 FRAME SHARING): Rework logic here.
    case "workspace_only":
      return "workspace_and_emails";
    case "workspace_and_emails":
    case "all_scopes":
      return "workspace_and_emails";
    default:
      assertNever(sharingPolicy);
  }
}

export async function checkFrameShareScopePermission(
  auth: Authenticator,
  shareScope: FileShareScope,
  frame: FileResource
): Promise<Result<void, DustError<"unauthorized">>> {
  if (shareScope !== "public") {
    return new Ok(undefined);
  }

  // Write half of [shared-frame-with-functions-needs-workspace-user]: the read path hides such a
  // Frame from every viewer who is not a workspace user, so publishing it would mint a dead link.
  const hasActiveFrameFunctions = await frame.hasActiveFrameFunctions();
  if (hasActiveFrameFunctions) {
    return new Err(
      new DustError(
        "unauthorized",
        "This Frame has functions, which only workspace members can run. It cannot be shared publicly."
      )
    );
  }

  const workspace = auth.getNonNullableWorkspace();
  if (workspace.sharingPolicy !== "all_scopes") {
    return new Err(
      new DustError(
        "unauthorized",
        "Public sharing is disabled for this workspace."
      )
    );
  }
  if (!(await auth.hasWorkspacePermission("publish", "frame"))) {
    return new Err(
      new DustError(
        "unauthorized",
        "You do not have permission to share this frame publicly."
      )
    );
  }

  return new Ok(undefined);
}

export async function checkFrameEmailGrantPermission(
  auth: Authenticator,
  rawEmails: string[],
  frame: FileResource
): Promise<Result<void, DustError<"unauthorized">>> {
  if (rawEmails.length === 0) {
    return new Ok(undefined);
  }

  const workspace = auth.getNonNullableWorkspace();
  const externalSharingDisabledByPolicy =
    workspace.sharingPolicy === "workspace_only";
  // Write half of [shared-frame-with-functions-needs-workspace-user]: the read path hides such a
  // Frame from non-members, so inviting one would mint a dead link. Kept apart from the policy
  // flag so the refusal can name which of the two applies.
  const externalSharingDisabledByFunctions =
    await frame.hasActiveFrameFunctions();
  const canInviteExternal =
    !externalSharingDisabledByPolicy &&
    !externalSharingDisabledByFunctions &&
    (await auth.hasWorkspacePermission("invite", "frame"));
  if (canInviteExternal) {
    return new Ok(undefined);
  }

  const emails = rawEmails.map((email) => email.toLowerCase());
  const memberEmails = await getFrameWorkspaceMemberEmails(auth, emails);

  const areAllEmailsMemberEmails = emails.every((email) =>
    memberEmails.has(email)
  );
  if (areAllEmailsMemberEmails) {
    return new Ok(undefined);
  }

  if (externalSharingDisabledByFunctions) {
    return new Err(
      new DustError(
        "unauthorized",
        "This Frame has functions, which only workspace members can run. Only workspace members can be invited."
      )
    );
  }

  const errorMessage = externalSharingDisabledByPolicy
    ? "Only workspace members can be invited when external sharing is disabled."
    : "You do not have permission to invite people outside the workspace. Only workspace members can be invited.";

  return new Err(new DustError("unauthorized", errorMessage));
}

async function getFrameWorkspaceMemberEmails(
  auth: Authenticator,
  emails: string[]
): Promise<Set<string>> {
  if (emails.length === 0) {
    return new Set();
  }
  const users = await UserResource.fetchByEmails(emails);
  const { memberships } = await MembershipResource.getActiveMemberships({
    users,
    workspace: auth.getNonNullableWorkspace(),
  });
  const userModelIds = new Set(
    memberships.map((membership) => membership.userId)
  );
  return new Set(
    users
      .filter((user) => userModelIds.has(user.id))
      .map((user) => user.email.toLowerCase())
  );
}

const SHARE_NOTIFICATION_MAX_PER_DAY = 1;
const SHARE_NOTIFICATION_TIMEFRAME_SECONDS = 24 * 60 * 60; // 24 hours.

async function sendFrameSharedEmail({
  frameUrl,
  sharedByName,
  shareToken,
  to,
}: {
  frameUrl: string;
  sharedByName: string;
  shareToken: string;
  to: string;
}): Promise<void> {
  // Rate limit to 1 notification per recipient per frame per 24 hours to prevent spam.
  const remaining = await rateLimiter({
    key: `frame_share_notification:${shareToken}:${to}`,
    maxPerTimeframe: SHARE_NOTIFICATION_MAX_PER_DAY,
    timeframeSeconds: SHARE_NOTIFICATION_TIMEFRAME_SECONDS,
    logger,
  });
  if (remaining <= 0) {
    return;
  }

  await sendEmailWithTemplate({
    to,
    from: config.getSupportEmailAddress(),
    subject: `${sharedByName} shared a frame with you`,
    body: `<p>${escape(sharedByName)} is sharing a frame with you on Dust.</p>`,
    buttonLabel: "View frame",
    buttonUrl: frameUrl,
  });
}

/**
 * @cc [owner:flvndvd,label:error-handling] sharing-notification-failures
 * Failures fetching share links or sending invitations are logged without failing grant creation.
 */
function notifyFrameSharingInvitations(
  auth: Authenticator,
  file: FileResource,
  emails: string[]
): void {
  if (emails.length === 0) {
    return;
  }
  const user = auth.getNonNullableUser();

  const sendNotifications = async () => {
    const shareInfo = await file.getShareInfo();
    if (!shareInfo) {
      return;
    }
    const frameUrl = shareInfo.shareUrl;
    const shareToken = frameUrl.split("/").at(-1) ?? "";

    for (const email of emails) {
      void sendFrameSharedEmail({
        to: email,
        sharedByName: user.fullName(),
        frameUrl,
        shareToken,
      }).catch((error) => {
        logger.info(
          {
            email,
            error: normalizeError(error),
            fileId: file.sId,
            workspaceId: file.workspaceId,
          },
          "Failed to send sharing notification email"
        );
      });
    }
  };
  void sendNotifications().catch((error) => {
    logger.error(
      {
        error: normalizeError(error),
        fileId: file.sId,
        workspaceId: file.workspaceId,
      },
      "Failed to send Frame sharing notifications"
    );
  });
}
