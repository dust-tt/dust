import { createHmac, timingSafeEqual } from "crypto";

import config from "@app/lib/api/config";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ValidationTokenPayload = {
  actionId: string;
  timestamp: number;
  approvalState: "approved" | "rejected";
};

export type TokenError =
  | { type: "invalid_signature" }
  | { type: "expired" }
  | { type: "malformed" };

function getSigningSecret(): string {
  return config.getEmailValidationSecret();
}

function signPayload(payload: string): string {
  const secret = getSigningSecret();
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

function verifySignature(payload: string, signature: string): boolean {
  const expectedSignature = signPayload(payload);

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Generates a signed validation token for email action approval links.
 * Token format: base64url(JSON payload).signature
 */
export function generateValidationToken(
  actionId: string,
  approvalState: "approved" | "rejected"
): string {
  const payload: ValidationTokenPayload = {
    actionId,
    timestamp: Date.now(),
    approvalState,
  };

  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString("base64url");
  const signature = signPayload(payloadBase64);

  return `${payloadBase64}.${signature}`;
}

/**
 * Verifies a signed validation token and extracts its payload.
 * Checks both signature validity and token expiration (24h).
 */
export function verifyValidationToken(
  token: string
): Result<ValidationTokenPayload, TokenError> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return new Err({ type: "malformed" });
  }

  const [payloadBase64, signature] = parts;

  if (!verifySignature(payloadBase64, signature)) {
    return new Err({ type: "invalid_signature" });
  }

  let payload: ValidationTokenPayload;
  try {
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString(
      "utf8"
    );
    payload = JSON.parse(payloadJson);
  } catch {
    return new Err({ type: "malformed" });
  }

  // Validate payload structure.
  if (
    typeof payload.actionId !== "string" ||
    typeof payload.timestamp !== "number" ||
    (payload.approvalState !== "approved" &&
      payload.approvalState !== "rejected")
  ) {
    return new Err({ type: "malformed" });
  }

  // Check expiration.
  const now = Date.now();
  if (now - payload.timestamp > TOKEN_EXPIRY_MS) {
    return new Err({ type: "expired" });
  }

  return new Ok(payload);
}
