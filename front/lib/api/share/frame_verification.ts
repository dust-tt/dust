import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { runOnRedis } from "@app/lib/api/redis";
import { ExternalViewerSessionResource } from "@app/lib/resources/external_viewer_session_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { SharingGrantResource } from "@app/lib/resources/sharing_grant_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger, { auditLog } from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import crypto from "crypto";
import { escape } from "html-escaper";

/**
 * @cc [owner:flvndvd,label:security] frame-verification-enumeration
 * Unknown shares and ungranted emails return success without sending a code.
 */
export async function requestFrameEmailVerification({
  shareToken,
  email: rawEmail,
}: {
  shareToken: string;
  email: string;
}): Promise<Result<void, "rate_limited">> {
  const email = rawEmail.toLowerCase().trim();
  const result = await FileResource.fetchByShareToken(shareToken);
  if (result.isErr()) {
    return new Ok(undefined);
  }
  const { file, shareScope } = result.value;
  if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
    return new Ok(undefined);
  }
  const grant = await SharingGrantResource.findForEmail(file, email);
  if (!grant) {
    auditLog(
      { author: "no-author", email, shareToken },
      "Frame OTP requested for email without active grant"
    );
    return new Ok(undefined);
  }
  const challenge = await generateFrameOtpChallenge({ email, shareToken });
  if (challenge.isErr()) {
    return challenge;
  }
  await sendFrameOtpEmail({
    to: email,
    code: challenge.value.code,
    sharedByName: grant.grantingUser?.fullName() ?? "Someone",
  });
  return new Ok(undefined);
}

/**
 * @cc [owner:flvndvd,label:security] frame-verification-grant-order
 * Validate the code before revealing grant access, then recheck the grant before issuing a session.
 */
export async function verifyFrameEmailCode({
  shareToken,
  email: rawEmail,
  code,
}: {
  shareToken: string;
  email: string;
  code: string;
}): Promise<
  Result<
    ExternalViewerSessionResource,
    ValidateOtpError | "share_not_found" | "no_access"
  >
> {
  const email = rawEmail.toLowerCase().trim();
  const result = await FileResource.fetchByShareToken(shareToken);
  if (result.isErr()) {
    return new Err("share_not_found");
  }
  const { file, shareScope, workspace } = result.value;
  if (shareScope !== "emails_only" && shareScope !== "workspace_and_emails") {
    return new Err("share_not_found");
  }
  const validation = await validateFrameOtpChallenge({
    email,
    shareToken,
    submittedCode: code,
  });
  if (validation.isErr()) {
    return validation;
  }
  const grant = await SharingGrantResource.findForEmail(file, email);
  if (!grant) {
    return new Err("no_access");
  }
  const session = await ExternalViewerSessionResource.create(workspace, {
    email,
  });
  return new Ok(session);
}

const OTP_TTL_SECONDS = 15 * 60; // 15 minutes.
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MAX_PER_HOUR = 5;
const OTP_RATE_LIMIT_TIMEFRAME_SECONDS = 3600; // 1 hour.

const OTP_VERIFY_MAX_ATTEMPTS = 10;
const OTP_VERIFY_TIMEFRAME_SECONDS = 15 * 60; // 15 minutes.

function frameOtpChallengeKey(shareToken: string, email: string): string {
  return `frame_otp_challenge:${shareToken}:${email}`;
}

interface OtpChallengeData {
  attempts: number;
  code: string;
}

async function generateFrameOtpChallenge({
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

async function sendFrameOtpEmail({
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

type ValidateOtpError =
  | "expired"
  | "invalid_code"
  | "max_attempts"
  | "rate_limited";

async function validateFrameOtpChallenge({
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
