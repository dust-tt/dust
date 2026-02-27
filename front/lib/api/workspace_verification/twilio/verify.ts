import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

import { getTwilioClient, getTwilioVerifyServiceSid } from "./client";

const TwilioErrorSchema = z.object({
  code: z.number(),
});

function getTwilioErrorCode(error: unknown): number | null {
  const result = TwilioErrorSchema.safeParse(error);
  return result.success ? result.data.code : null;
}

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

    switch (getTwilioErrorCode(error)) {
      case 60220:
      case 60605:
        return new Err(
          new Error(
            "SMS verification is not available in your region. Please contact support for alternatives."
          )
        );
      case 60410:
        return new Err(
          new Error(
            "Verification temporarily unavailable. Please try again later."
          )
        );
      default:
        logger.error(
          { err, phoneNumber: phoneNumber.slice(0, 6) + "***", panic: true },
          "Twilio sendOtp error, investigate and ask @jd"
        );
        return new Err(
          new Error("Failed to send verification code. Please try again.")
        );
    }
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
