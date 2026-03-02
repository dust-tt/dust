import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { ConversationType } from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const SANDBOX_TOKEN_PREFIX = "sbt-";

const SandboxExecTokenPayloadSchema = z.object({
  wId: z.string(),
  cId: z.string(),
  uId: z.string(),
  sbId: z.string(),
});

export type SandboxExecTokenPayload = z.infer<
  typeof SandboxExecTokenPayloadSchema
>;

export function generateSandboxExecToken(
  auth: Authenticator,
  {
    conversation,
    sandbox,
    expiryMs = 2 * 60 * 1000, // Default to 2 minutes
  }: {
    conversation: ConversationType;
    sandbox: SandboxResource;
    expiryMs?: number;
  }
): string {
  const payload: SandboxExecTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    cId: conversation.sId,
    uId: auth.getNonNullableUser().sId,
    sbId: sandbox.sId,
  };

  const secret = config.getSandboxJwtSecret();

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: expiryMs / 1000, // expiresIn is in seconds
  });

  return `${SANDBOX_TOKEN_PREFIX}${token}`;
}

export function verifySandboxExecToken(
  token: string
): SandboxExecTokenPayload | null {
  if (!token.startsWith(SANDBOX_TOKEN_PREFIX)) {
    return null;
  }

  const jwtToken = token.slice(SANDBOX_TOKEN_PREFIX.length);
  const secret = config.getSandboxJwtSecret();

  let rawPayload: unknown;
  try {
    rawPayload = jwt.verify(jwtToken, secret, { algorithms: ["HS256"] });
  } catch (error) {
    logger.error(
      { error: normalizeError(error) },
      "Failed to verify sandbox exec token"
    );
    return null;
  }

  const parseResult = SandboxExecTokenPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    logger.error(
      { error: parseResult.error.flatten() },
      "Invalid sandbox exec token payload structure"
    );
    return null;
  }

  return parseResult.data;
}
