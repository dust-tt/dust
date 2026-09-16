import type { WebhookSourceSignatureAlgorithm } from "@app/types/triggers/webhooks";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * @cc [owner:adrsimon,label:security] accepted-signature-encodings
 * A signature MUST be accepted only when it equals the HMAC of `signedContent` keyed by `secret`
 * under `algorithm`, encoded as `{algorithm}=<hex>`, raw base64, or raw hex. An empty `secret` or
 * `signature` MUST be rejected, and every comparison MUST be constant-time and tolerate a length
 * mismatch.
 */
export const verifySignature = ({
  signedContent,
  secret,
  signature,
  algorithm,
}: {
  signedContent: string;
  secret: string;
  signature: string;
  algorithm: WebhookSourceSignatureAlgorithm;
}): boolean => {
  if (!secret || !signature) {
    return false;
  }

  // Try "{algorithm}={hex}" format first (GitHub-style).
  const prefixedHex = `${algorithm}=${createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("hex")}`;
  if (safeCompare(signature, prefixedHex)) {
    return true;
  }

  // Try raw base64 format (HelpScout, etc.).
  const rawBase64 = createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("base64");
  if (safeCompare(signature, rawBase64)) {
    return true;
  }

  // Try raw hex format (GoCardless, etc.).
  const rawHex = createHmac(algorithm, secret)
    .update(signedContent, "utf8")
    .digest("hex");
  if (safeCompare(signature, rawHex)) {
    return true;
  }

  return false;
};

function safeCompare(a: string, b: string): boolean {
  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    // Length mismatch.
    return false;
  }
}
