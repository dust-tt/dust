import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { getTwilioClient, getTwilioVerifyServiceSid } from "./client";

export type SendOtpResult = {
  verificationSid: string;
  status: string;
};

export async function sendOtp(
  phoneNumber: string,
  statusCallbackUrl?: string
): Promise<Result<SendOtpResult, Error>> {
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
    if (err.message.includes("Invalid parameter `To`")) {
      return new Err(new Error("Invalid phone number format"));
    }
    if (
      err.message.includes("Max send attempts reached") ||
      err.message.includes("rate limit")
    ) {
      throw new Error(`Twilio rate limit exceeded: ${err.message}`);
    }
    throw new Error(`Failed to send OTP: ${err.message}`);
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
    throw new Error(`Failed to verify code: ${err.message}`);
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
