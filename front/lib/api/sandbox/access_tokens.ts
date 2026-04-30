import config from "@app/lib/api/config";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import type { SandboxMCPAction } from "@app/lib/resources/agent_mcp_action_resource";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
} from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const SANDBOX_TOKEN_PREFIX = "sbt-";

const SandboxExecTokenPayloadSchema = z.object({
  wId: z.string(),
  cId: z.string(),
  // Optional: omitted when the conversation is driven by a non-human actor
  // (e.g. a Slack bot user with no associated Dust user).
  uId: z.string().optional(),
  aId: z.string(),
  mId: z.string(),
  sbId: z.string(),
  execId: z.string(),
});

export type SandboxExecTokenPayload = z.infer<
  typeof SandboxExecTokenPayloadSchema
>;

const EXEC_TOKEN_REDIS_TTL_SECONDS = 24 * 60 * 60; // 24 hours

function sandboxTokenRedisKey(sbId: string, execId: string): string {
  return `sandbox:${sbId}:exec:${execId}`;
}

function sandboxTokenRedisKeyPattern(sbId: string): string {
  return `sandbox:${sbId}:exec:*`;
}

const REDIS_ORIGIN = "sandbox_exec_tokens" as const;

export function generateExecId(): string {
  return crypto.randomBytes(8).toString("hex");
}

async function registerExecToken(
  token: Pick<SandboxExecTokenPayload, "sbId" | "execId">
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.set(sandboxTokenRedisKey(token.sbId, token.execId), "1", {
      EX: EXEC_TOKEN_REDIS_TTL_SECONDS,
    })
  );
}

export async function revokeExecToken(
  token: Pick<SandboxExecTokenPayload, "sbId" | "execId">
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.del(sandboxTokenRedisKey(token.sbId, token.execId))
  );
}

async function isExecTokenValid(
  token: Pick<SandboxExecTokenPayload, "sbId" | "execId">
): Promise<boolean> {
  return runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const result = await client.exists(
      sandboxTokenRedisKey(token.sbId, token.execId)
    );
    return result === 1;
  });
}

export async function revokeAllExecTokensForSandbox(
  sbId: string
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, async (client) => {
    const keys: string[] = [];
    for await (const key of client.scanIterator({
      MATCH: sandboxTokenRedisKeyPattern(sbId),
    })) {
      keys.push(key);
    }
    if (keys.length > 0) {
      await client.del(keys);
    }
  });
}

export async function generateSandboxExecToken(
  auth: Authenticator,
  {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    expiryMs = 2 * 60 * 1000, // Default to 2 minutes
  }: {
    agentConfiguration: AgentConfigurationType;
    agentMessage: AgentMessageType;
    conversation: ConversationType;
    sandbox: SandboxResource;
    execId: string;
    expiryMs?: number;
  }
): Promise<string> {
  const payload: SandboxExecTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    cId: conversation.sId,
    uId: auth.user()?.sId,
    aId: agentConfiguration.sId,
    mId: agentMessage.sId,
    sbId: sandbox.sId,
    execId,
  };

  await registerExecToken(payload);

  const secret = config.getSandboxJwtSecret();

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: expiryMs / 1000, // expiresIn is in seconds
  });

  return `${SANDBOX_TOKEN_PREFIX}${token}`;
}

/**
 * Verify a sandbox exec token and check Redis-backed revocation.
 */
export async function verifySandboxExecToken(
  token: string
): Promise<SandboxExecTokenPayload | null> {
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

  const payload = parseResult.data;

  const valid = await isExecTokenValid(payload);
  if (!valid) {
    logger.warn(
      { sbId: payload.sbId, execId: payload.execId },
      "Sandbox exec token revoked"
    );
    return null;
  }

  return payload;
}

/**
 * Pins a sandbox action to the JWT's specific (cId, mId) session. Workspace
 * match is enforced upstream by the auth wrapper; this additional check
 * prevents a sandbox client from polling or executing actions belonging to a
 * different session in the same workspace.
 *
 * Resolves the JWT's `mId` (a Message sId) to its AgentMessage model id and
 * compares against the action's `agentMessageId`. Returns false on either a
 * missing message or a mismatch.
 */
export async function isSandboxActionInClaimsSession(
  auth: Authenticator,
  claims: SandboxExecTokenPayload,
  action: SandboxMCPAction
): Promise<boolean> {
  const message = await MessageModel.findOne({
    where: {
      sId: claims.mId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["agentMessageId"],
  });
  return (
    message?.agentMessageId != null &&
    action.agentMessageId === message.agentMessageId
  );
}
