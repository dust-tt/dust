import config from "@app/lib/api/config";
import { sendEmailWithTemplate } from "@app/lib/api/email";
import { runOnRedis } from "@app/lib/api/redis";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import crypto from "crypto";
import { escape } from "html-escaper";

const OTP_TTL_SECONDS = 15 * 60; // 15 minutes.
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_MAX_PER_HOUR = 5;
const OTP_RATE_LIMIT_TIMEFRAME_SECONDS = 3600; // 1 hour.

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
    body: `<p>${escape(sharedByName)} shared a Frame with you on Dust.</p>
      <p>Your login code:</p>
      <p style="font-size: 24px; font-weight: bold; letter-spacing: 4px; margin-block: 20px;">${escape(code)}</p>
      <p>Expires in ${Math.floor(OTP_TTL_SECONDS / 60)} minutes. Didn't request this? Ignore this email.</p>`,
  });
}

type ValidateOtpError = "expired" | "max_attempts" | "invalid_code";

export async function validateFrameOtpChallenge({
  email,
  shareToken,
  submittedCode,
}: {
  email: string;
  shareToken: string;
  submittedCode: string;
}): Promise<Result<void, ValidateOtpError>> {
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
