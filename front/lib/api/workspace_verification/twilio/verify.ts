import logger from "@app/logger/logger";
import { isDevelopment } from "@app/types/shared/env";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

import { getTwilioClient, getTwilioVerifyServiceSid } from "./client";

export type SendOtpResult = {
  verificationSid: string;
  status: string;
};

export async function sendOtp(
  phoneNumber: string,
  statusCallbackUrl?: string
): Promise<Result<SendOtpResult, Error>> {
  if (isDevelopment()) {
    logger.info(
      { phoneNumber: phoneNumber.slice(0, 6) + "***" },
      "Dev mode: skipping Twilio sendOtp"
    );
    return new Ok({
      verificationSid: "dev-verification-sid",
      status: "pending",
    });
  }

  const client = getTwilioClient();
  const serviceSid = getTwilioVerifyServiceSid();

  let verification;
  try {
    verification = await client.verify.v2
      .services(serviceSid)
      .verifications.create({
        to: phoneNumber,
        channel: "sms",
        ...(statusCallbackUrl && { statusCallback: statusCallbackUrl }),
      });
  } catch (error) {
    const err = normalizeError(error);
    logger.error(
      { err, phoneNumber: phoneNumber.slice(0, 6) + "***" },
      "Twilio sendOtp error"
    );
    if (err.message.includes("Invalid parameter `To`")) {
      return new Err(new Error("Invalid phone number format"));
    }
    if (
      err.message.includes("Max send attempts reached") ||
      err.message.includes("rate limit")
    ) {
      return new Err(new Error("Too many attempts. Please try again later."));
    }
    if (err.message.includes("60220")) {
      return new Err(new Error("Dust doesn't operate in China."));
    }
    logger.error(
      { err, phoneNumber: phoneNumber.slice(0, 6) + "***" },
      "Twilio sendOtp error, investigate and ask @jd"
    );
    throw new Error("Failed to send verification code. Please try again.");
  }

  return new Ok({
    verificationSid: verification.sid,
    status: verification.status,
  });
}

export type VerifyOtpResult = {
  valid: boolean;
  status: string;
};

export type VerifyOtpErrorCode = "invalid_code" | "expired";

export class VerifyOtpError extends Error {
  constructor(
    public readonly code: VerifyOtpErrorCode,
    message: string
  ) {
    super(message);
    this.name = "VerifyOtpError";
  }
}

export async function checkOtp(
  phoneNumber: string,
  code: string
): Promise<Result<VerifyOtpResult, VerifyOtpError>> {
  if (isDevelopment()) {
    logger.info(
      { phoneNumber: phoneNumber.slice(0, 6) + "***" },
      "Dev mode: skipping Twilio checkOtp"
    );
    return new Ok({ valid: true, status: "approved" });
  }

  const client = getTwilioClient();
  const serviceSid = getTwilioVerifyServiceSid();

  let verificationCheck;
  try {
    verificationCheck = await client.verify.v2
      .services(serviceSid)
      .verificationChecks.create({
        to: phoneNumber,
        code,
      });
  } catch (error) {
    const err = normalizeError(error);
    if (err.message.includes("was not found")) {
      return new Err(
        new VerifyOtpError(
          "expired",
          "Verification session not found or expired"
        )
      );
    }
    throw new Error("Failed to verify code. Please try again.");
  }

  if (verificationCheck.status !== "approved") {
    if (verificationCheck.status === "expired") {
      return new Err(
        new VerifyOtpError("expired", "Verification code has expired")
      );
    }
    return new Err(
      new VerifyOtpError("invalid_code", "Invalid verification code")
    );
  }

  return new Ok({
    valid: true,
    status: verificationCheck.status,
  });
}
