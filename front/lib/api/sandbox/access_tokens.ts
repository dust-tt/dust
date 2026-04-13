import config from "@app/lib/api/config";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const SANDBOX_TOKEN_PREFIX = "sbt-";

const SandboxExecTokenPayloadSchema = z.object({
  wId: z.string(),
  cId: z.string(),
  uId: z.string(),
  aId: z.string(),
  mId: z.string(),
  sbId: z.string(),
  execId: z.string().optional(),
});

export type SandboxExecTokenPayload = z.infer<
  typeof SandboxExecTokenPayloadSchema
>;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const EXEC_TOKEN_REDIS_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function execTokenRedisKey(sbId: string, execId: string): string {
  return `sandbox:${sbId}:exec:${execId}`;
}

const REDIS_ORIGIN = "sandbox_exec_tokens" as const;

export async function registerExecToken(
  sbId: string,
  execId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.set(execTokenRedisKey(sbId, execId), "1", {
      EX: EXEC_TOKEN_REDIS_TTL_SECONDS,
    })
  );
}

export async function revokeExecToken(
  sbId: string,
  execId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.del(execTokenRedisKey(sbId, execId))
  );
}

export async function isExecTokenValid(
  sbId: string,
  execId: string
): Promise<boolean> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const result = await client.exists(execTokenRedisKey(sbId, execId));
    return result === 1;
  });
}

export async function revokeAllExecTokensForSandbox(
  sbId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const pattern = `sandbox:${sbId}:exec:*`;
    for await (const key of client.scanIterator({ MATCH: pattern })) {
      await client.del(key);
    }
  });
}

export function generateSandboxExecToken(
  auth: Authenticator,
  {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    expiryMs = TOKEN_TTL_MS,
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
    sandbox: SandboxResource;
    execId: string;
    expiryMs?: number;
  }
): string {
  const payload: SandboxExecTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    cId: conversation.sId,
    uId: auth.getNonNullableUser().sId,
    aId: agentConfiguration.sId,
    mId: agentMessage.sId,
    sbId: sandbox.sId,
    execId,
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

/**
 * Verify a sandbox exec token AND check Redis-backed revocation.
 * Use this for endpoints that need revocation checking (e.g., call_tool).
 * Backward compatible: tokens without execId skip the Redis check.
 */
export async function verifySandboxExecTokenWithRevocation(
  token: string
): Promise<SandboxExecTokenPayload | null> {
  const payload = verifySandboxExecToken(token);
  if (!payload) {
    return null;
  }

  // Tokens without execId are backward-compatible — skip revocation check.
  if (payload.execId) {
    const valid = await isExecTokenValid(payload.sbId, payload.execId);
    if (!valid) {
      logger.warn(
        { sbId: payload.sbId, execId: payload.execId },
        "Sandbox exec token revoked"
      );
      return null;
    }
  }

  return payload;
}
