import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const TURNSTILE_SITEVERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type CaptchaErrorType = "invalid" | "network";

export class CaptchaError extends Error {
  constructor(readonly type: CaptchaErrorType) {
    super(type);
  }
}

interface TurnstileSiteVerifyResponse {
  success: boolean;
  "error-codes"?: string[];
}

interface VerifyTurnstileTokenParams {
  token: string;
  remoteIp?: string;
}

export async function verifyTurnstileToken({
  token,
  remoteIp,
}: VerifyTurnstileTokenParams): Promise<Result<undefined, CaptchaError>> {
  const body = new URLSearchParams();
  body.append("secret", config.getTurnstileSecretKey());
  body.append("response", token);
  if (remoteIp) {
    body.append("remoteip", remoteIp);
  }

  let response: Response;
  try {
    response = await fetch(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (err) {
    logger.error(
      { err: normalizeError(err) },
      "Turnstile siteverify request failed."
    );
    return new Err(new CaptchaError("network"));
  }

  if (!response.ok) {
    logger.error(
      { status: response.status },
      "Turnstile siteverify returned non-200."
    );
    return new Err(new CaptchaError("network"));
  }

  const data: TurnstileSiteVerifyResponse = await response.json();
  if (!data.success) {
    logger.warn(
      { errorCodes: data["error-codes"] },
      "Turnstile token rejected."
    );
    return new Err(new CaptchaError("invalid"));
  }

  return new Ok(undefined);
}
