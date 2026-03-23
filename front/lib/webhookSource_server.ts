import type { WebhookSourceSignatureAlgorithm } from "@app/types/triggers/webhooks";
import { createHmac, timingSafeEqual } from "crypto";

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
