import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
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

export function generateSandboxExecToken({
  workspaceId,
  conversationId,
  userId,
  sandboxId,
}: {
  workspaceId: string;
  conversationId: string;
  userId: string;
  sandboxId: string;
}): string {
  const payload: SandboxExecTokenPayload = {
    wId: workspaceId,
    cId: conversationId,
    uId: userId,
    sbId: sandboxId,
  };

  const secret = config.getSandboxJwtSecret();

  // Sign JWT with HS256 algorithm, valid for 2 minutes.
  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: "2m",
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
