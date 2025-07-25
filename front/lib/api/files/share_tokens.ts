import { Err, Ok } from "@dust-tt/client";
import crypto from "crypto";
import { z } from "zod";

import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { Result } from "@app/types";
import { safeParseJSON } from "@app/types";

const TokenDataSchema = z.object({
  fId: z.string(),
  wId: z.string(),
});
type TokenData = z.infer<typeof TokenDataSchema>;

/**
 * Generate a stateless token to share a file.
 * Token format: base64url(data) + "." + base64url(hmac_sha256(data, secret)).
 * Where first part is JSON with fileId and workspaceId.
 * Second part is HMAC signature of the first part using the secret.
 */
export function generateSignedToken(
  auth: Authenticator,
  file: FileResource,
  { secret }: { secret: string }
): string {
  const data: TokenData = {
    fId: file.sId,
    wId: auth.getNonNullableWorkspace().sId,
  };

  // Convert data to JSON and encode as base64url.
  const dataJson = JSON.stringify(data);
  const dataBase64url = Buffer.from(dataJson, "utf8").toString("base64url");

  // Generate HMAC signature.
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(dataBase64url);
  const signature = hmac.digest("base64url");

  // Combine data and signature.
  return `${dataBase64url}.${signature}`;
}

/**
 * Verify a stateless token and return the parsed data.
 */
export function verifySignedToken(
  token: string,
  secret: string
): Result<TokenData, Error> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    return new Err(new Error("Invalid token format"));
  }

  const [dataBase64url, providedSignature] = parts;

  // Verify signature.
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(dataBase64url);
  const expectedSignature = hmac.digest("base64url");

  if (providedSignature !== expectedSignature) {
    return new Err(new Error("Invalid token signature"));
  }

  // Parse data.
  const rawData = Buffer.from(dataBase64url, "base64url").toString("utf8");
  const dataJsonRes = safeParseJSON(rawData);

  if (dataJsonRes.isErr()) {
    return new Err(new Error("Invalid token data"));
  }

  const data = TokenDataSchema.safeParse(dataJsonRes.value);
  if (!data.success) {
    return new Err(new Error(`Invalid token data: ${data.error.message}`));
  }

  return new Ok(data.data);
}
