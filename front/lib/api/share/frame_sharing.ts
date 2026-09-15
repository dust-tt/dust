import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { FileShareScope } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { WorkspaceSharingPolicy } from "@app/types/user";
import crypto from "crypto";
import { escape } from "html-escaper";
import type { Transaction } from "sequelize";

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

export async function getFrameWorkspaceMemberEmails(
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
  const memberIds = new Set(memberships.map((membership) => membership.userId));
  return new Set(
    users
      .filter((user) => memberIds.has(user.id))
      .map((user) => user.email.toLowerCase())
  );
}

const OTP_TTL_SECONDS = 15 * 60; // 15 minutes.
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MAX_PER_HOUR = 5;
const OTP_RATE_LIMIT_TIMEFRAME_SECONDS = 3600; // 1 hour.

const OTP_VERIFY_MAX_ATTEMPTS = 10;
const OTP_VERIFY_TIMEFRAME_SECONDS = 15 * 60; // 15 minutes.

const SHARE_NOTIFICATION_MAX_PER_DAY = 1;
const SHARE_NOTIFICATION_TIMEFRAME_SECONDS = 24 * 60 * 60; // 24 hours.

function frameOtpChallengeKey(shareToken: string, email: string): string {
  return `frame_otp_challenge:${shareToken}:${email}`;
}

interface OtpChallengeData {
  attempts: number;
  code: string;
}

export async function generateFrameOtpChallenge({
  email,
  shareToken,
}: {
  email: string;
  shareToken: string;
}): Promise<Result<{ code: string }, "rate_limited">> {
  // Rate limit by email: max 5 OTP requests per hour.
  // TODO(2026-03-19 FRAME SHARING): Should we consider limiting per IP/email.
  const remaining = await rateLimiter({
    key: `frame_otp:rate:${email}`,
    maxPerTimeframe: OTP_RATE_LIMIT_MAX_PER_HOUR,
    timeframeSeconds: OTP_RATE_LIMIT_TIMEFRAME_SECONDS,
    logger,
  });

  if (remaining <= 0) {
    return new Err("rate_limited");
  }

  const code = crypto.randomInt(100000, 1000000).toString();

  await runOnRedis({ origin: "otp_challenge" }, async (redis) => {
    const key = frameOtpChallengeKey(shareToken, email);
    const data: OtpChallengeData = { code, attempts: 0 };
    await redis.set(key, JSON.stringify(data), { EX: OTP_TTL_SECONDS });
  });

  return new Ok({ code });
}

export async function sendFrameOtpEmail({
  to,
  code,
  sharedByName,
}: {
  to: string;
  code: string;
  sharedByName: string;
}): Promise<Result<void, Error>> {
  return sendEmailWithTemplate({
    to,
    // TODO(2026-03-19 FRAME SHARING): Consider sending from another email address.
    from: config.getSupportEmailAddress(),
    subject: "Your Dust login code",
    body: `<p>${escape(sharedByName)} shared a frame with you on Dust.</p>
      <p>Your login code:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; margin-block: 20px;">${escape(code)}</p>
      <p>Expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes. Didn't request this? Ignore this email.</p>`,
  });
}

export async function sendFrameSharedEmail({
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
export function notifyFrameSharingInvitations(
  auth: Authenticator,
  file: FileResource,
  emails: string[],
  { transaction }: { transaction?: Transaction } = {}
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
  const scheduleNotifications = () => {
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
  };

  if (transaction) {
    transaction.afterCommit(scheduleNotifications);
  } else {
    scheduleNotifications();
  }
}

type ValidateOtpError =
  | "expired"
  | "invalid_code"
  | "max_attempts"
  | "rate_limited";

export async function validateFrameOtpChallenge({
  email,
  shareToken,
  submittedCode,
}: {
  email: string;
  shareToken: string;
  submittedCode: string;
}): Promise<Result<void, ValidateOtpError>> {
  // Primary brute-force protection: atomic rate limiter via Redis Lua script.
  const remaining = await rateLimiter({
    key: `frame_otp:verify:${shareToken}:${email}`,
    maxPerTimeframe: OTP_VERIFY_MAX_ATTEMPTS,
    timeframeSeconds: OTP_VERIFY_TIMEFRAME_SECONDS,
    logger,
  });
  if (remaining <= 0) {
    return new Err("rate_limited");
  }

  // Secondary defense-in-depth: per-challenge attempt counter.
  // Note: not atomic (read-check-increment across multiple Redis calls), but the rate limiter
  // above is the primary protection.
  return runOnRedis(
    { origin: "otp_challenge" },
    async (redis): Promise<Result<void, ValidateOtpError>> => {
      const key = frameOtpChallengeKey(shareToken, email);
      const raw = await redis.get(key);

      if (!raw) {
        return new Err("expired");
      }

      const data: OtpChallengeData = JSON.parse(raw);
      if (data.attempts >= OTP_MAX_ATTEMPTS) {
        await redis.del(key);
        return new Err("max_attempts");
      }

      // Increment attempts.
      data.attempts += 1;
      const ttlSeconds = await redis.ttl(key);
      if (ttlSeconds > 0) {
        await redis.set(key, JSON.stringify(data), { EX: ttlSeconds });
      }

      // Timing-safe comparison.
      const expected = Buffer.from(data.code, "utf-8");
      const submitted = Buffer.from(submittedCode, "utf-8");

      if (
        expected.length !== submitted.length ||
        !crypto.timingSafeEqual(expected, submitted)
      ) {
        return new Err("invalid_code");
      }

      // Valid code, clean up.
      await redis.del(key);
      return new Ok(undefined);
    }
  );
}
