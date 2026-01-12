import {
  lookupPhoneNumber,
  sendOtp,
} from "@app/lib/api/workspace_verification/twilio";
import type { Authenticator } from "@app/lib/auth";
import { WorkspaceVerificationAttemptResource } from "@app/lib/resources/workspace_verification_attempt_resource";
import { rateLimiter } from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { assertNever, Err, Ok } from "@app/types";
import type { VerificationErrorType } from "@app/types/workspace_verification";

const MAX_ATTEMPTS_PER_PHONE = 3;
const MAX_DIFFERENT_PHONES_PER_WORKSPACE_PER_DAY = 3;
const COOLDOWN_DURATION_SECONDS = 30 * 60; // 30 minutes.
const DAY_IN_SECONDS = 24 * 60 * 60; // 24 hours.

type RateLimitCheckResult =
  | { allowed: true }
  | { allowed: false; error: StartVerificationError };

async function checkVerificationRateLimits(
  phoneNumberHash: string,
  workspaceModelId: number
): Promise<RateLimitCheckResult> {
  const phoneRemaining = await rateLimiter({
    key: `verification:phone:${phoneNumberHash}`,
    maxPerTimeframe: MAX_ATTEMPTS_PER_PHONE,
    timeframeSeconds: COOLDOWN_DURATION_SECONDS,
    logger,
  });

  if (phoneRemaining <= 0) {
    const retryAfterSeconds =
      Math.floor(Date.now() / 1000) + COOLDOWN_DURATION_SECONDS;
    return {
      allowed: false,
      error: {
        type: "rate_limit_error",
        message: "Too many verification attempts for this phone number.",
        retryAfterSeconds,
      },
    };
  }

  const workspaceRemaining = await rateLimiter({
    key: `verification:workspace:${workspaceModelId}:phones`,
    maxPerTimeframe: MAX_DIFFERENT_PHONES_PER_WORKSPACE_PER_DAY,
    timeframeSeconds: DAY_IN_SECONDS,
    logger,
  });

  if (workspaceRemaining <= 0) {
    const retryAfterSeconds = Math.floor(Date.now() / 1000) + DAY_IN_SECONDS;
    return {
      allowed: false,
      error: {
        type: "rate_limit_error",
        message:
          "Too many different phone numbers attempted for this workspace today.",
        retryAfterSeconds,
      },
    };
  }

  return { allowed: true };
}

export type StartVerificationError = {
  type: VerificationErrorType;
  message: string;
  retryAfterSeconds?: number;
};

export async function startVerification(
  auth: Authenticator,
  phoneNumber: string
): Promise<Result<void, StartVerificationError>> {
  const workspace = auth.getNonNullableWorkspace();
  const workspaceModelId = workspace.id;
  const phoneNumberHash =
    WorkspaceVerificationAttemptResource.hashPhoneNumber(phoneNumber);

  const existingAttempt =
    await WorkspaceVerificationAttemptResource.fetchByPhoneHash(
      auth,
      phoneNumberHash
    );

  if (existingAttempt) {
    if (existingAttempt.status === "verified") {
      return new Err({
        type: "invalid_request_error",
        message: "This workspace is already verified.",
      });
    }
  } else {
    const isPhoneUsedElsewhere =
      await WorkspaceVerificationAttemptResource.isPhoneAlreadyUsed(
        phoneNumberHash
      );
    if (isPhoneUsedElsewhere) {
      return new Err({
        type: "phone_already_used_error",
        message:
          "This phone number is already associated with another workspace.",
      });
    }
  }

  const lookupResult = await lookupPhoneNumber(phoneNumber);
  if (lookupResult.isErr()) {
    const error = lookupResult.error;
    // for eng-oncall: you can defer this to growth / paywall owners
    logger.error(
      {
        panic: true, // TODO(2026-03-01) - remove the panic:true
        workspaceId: workspace.sId,
        phoneNumberHash,
        errorCode: error.code,
      },
      "Phone lookup validation failed"
    );

    let message: string;
    switch (error.code) {
      case "not_mobile":
        message = "Only mobile phone numbers are accepted for verification.";
        break;
      case "high_sms_pumping_risk":
        message = "This phone number cannot be used for verification.";
        break;
      case "invalid_phone_number":
      case "lookup_failed":
        message = error.message;
        break;
      default:
        assertNever(error.code);
    }

    return new Err({
      type: "invalid_request_error",
      message,
    });
  }

  const rateLimitResult = await checkVerificationRateLimits(
    phoneNumberHash,
    workspaceModelId
  );
  if (!rateLimitResult.allowed) {
    return new Err(rateLimitResult.error);
  }

  const sendResult = await sendOtp(phoneNumber);
  if (sendResult.isErr()) {
    const error = sendResult.error;
    logger.error(
      {
        workspaceId: workspace.sId,
        phoneNumberHash,
        error: error.message,
      },
      "Failed to send verification OTP"
    );

    return new Err({
      type: "verification_error",
      message: "Failed to send verification code. Please try again.",
    });
  }

  const { verificationSid } = sendResult.value;

  if (existingAttempt) {
    await existingAttempt.recordNewAttempt(verificationSid);
    logger.info(
      {
        workspaceId: workspace.sId,
        phoneNumberHash,
        attemptNumber: existingAttempt.attemptNumber + 1,
      },
      "Recorded new verification attempt"
    );
  } else {
    await WorkspaceVerificationAttemptResource.makeNew(auth, {
      phoneNumberHash,
      twilioVerificationSid: verificationSid,
    });
    logger.info(
      {
        workspaceId: workspace.sId,
        phoneNumberHash,
        attemptNumber: 1,
      },
      "Created new verification attempt"
    );
  }

  return new Ok(undefined);
}
