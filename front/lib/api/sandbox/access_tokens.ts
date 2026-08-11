import config from "@app/lib/api/config";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { AgentMCPActionType } from "@app/types/actions";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";

export const SANDBOX_TOKEN_PREFIX = "sbt-";

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

const SandboxTokenPayloadSchema = z
  .object({
    wId: z.string(),
    uId: z.string().optional(),
    sbId: z.string(),
    execId: z.string(),
    cId: z.string().optional(),
    aId: z.string().optional(),
    aV: z.number().int().nonnegative().optional(),
    mId: z.string().optional(),
    actionId: z.string().optional(),
    spaceId: z.string().optional(),
    sandboxFunctionId: z.string().optional(),
    invocationId: z.string().optional(),
    fsMounts: z
      .array(
        z.object({
          kind: z.enum(["conversation", "pod"]),
          id: z.string(),
        })
      )
      .min(1)
      .max(2)
      .optional(),
    // Set for a fast Pod function, published on the promise that it does not call tools. A tool
    // call can wait on the user for as long as they take, which a fast invocation has no way to
    // survive, so the token it runs under cannot make one.
    noTools: z.literal(true).optional(),
  })
  .superRefine((payload, ctx) => {
    const actionClaims = [payload.aId, payload.mId, payload.actionId];
    const invocationClaims = [
      payload.spaceId,
      payload.sandboxFunctionId,
      payload.invocationId,
    ];
    const hasAction =
      payload.cId !== undefined && actionClaims.every(isDefined);
    const hasInvocation = invocationClaims.every(isDefined);
    const hasFileSystem = payload.fsMounts !== undefined;

    if (actionClaims.some(isDefined) && !hasAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incomplete sandbox action token claims.",
      });
    }
    if (invocationClaims.some(isDefined) && !hasInvocation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Incomplete sandbox function invocation token claims.",
      });
    }
    const tokenKindCount = [hasAction, hasInvocation, hasFileSystem].filter(
      Boolean
    ).length;
    if (tokenKindCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Sandbox token payload must include exactly one supported token kind.",
      });
    }
  });

export type SandboxTokenPayload = z.infer<typeof SandboxTokenPayloadSchema>;

export type SandboxExecTokenPayload = SandboxTokenPayload & {
  cId: string;
  aId: string;
  aV: number;
  mId: string;
  actionId: string;
};

export type SandboxFunctionInvocationTokenPayload = SandboxTokenPayload & {
  spaceId: string;
  sandboxFunctionId: string;
  invocationId: string;
};

export type SandboxFileSystemTokenPayload = SandboxTokenPayload & {
  fsMounts: Array<{ kind: "conversation" | "pod"; id: string }>;
};

export function isSandboxExecTokenPayload(
  payload: SandboxTokenPayload
): payload is SandboxExecTokenPayload {
  return (
    payload.cId !== undefined &&
    payload.aId !== undefined &&
    payload.aV !== undefined &&
    payload.mId !== undefined &&
    payload.actionId !== undefined
  );
}

function hasLegacySandboxExecTokenPayload(
  payload: SandboxTokenPayload
): payload is SandboxTokenPayload & {
  cId: string;
  aId: string;
  mId: string;
  actionId: string;
} {
  return (
    payload.cId !== undefined &&
    payload.aId !== undefined &&
    payload.mId !== undefined &&
    payload.actionId !== undefined
  );
}

async function resolveLegacySandboxExecAgentVersion(
  payload: SandboxTokenPayload & {
    cId: string;
    aId: string;
    mId: string;
  }
): Promise<number | null> {
  const workspace = await WorkspaceResource.fetchById(payload.wId);
  if (!workspace) {
    return null;
  }

  const message = await MessageModel.findOne({
    where: {
      sId: payload.mId,
      workspaceId: workspace.id,
    },
    attributes: ["id"],
    include: [
      {
        model: ConversationModel,
        as: "conversation",
        required: true,
        attributes: [],
        where: {
          sId: payload.cId,
          workspaceId: workspace.id,
        },
      },
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["agentConfigurationVersion"],
        where: {
          agentConfigurationId: payload.aId,
          workspaceId: workspace.id,
        },
      },
    ],
  });

  return message?.agentMessage?.agentConfigurationVersion ?? null;
}

export function isSandboxFunctionInvocationTokenPayload(
  payload: SandboxTokenPayload
): payload is SandboxFunctionInvocationTokenPayload {
  return (
    payload.spaceId !== undefined &&
    payload.sandboxFunctionId !== undefined &&
    payload.invocationId !== undefined
  );
}

export function isSandboxFileSystemTokenPayload(
  payload: SandboxTokenPayload
): payload is SandboxFileSystemTokenPayload {
  return payload.fsMounts !== undefined;
}

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
  token: Pick<SandboxTokenPayload, "sbId" | "execId">
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.set(sandboxTokenRedisKey(token.sbId, token.execId), "1", {
      EX: EXEC_TOKEN_REDIS_TTL_SECONDS,
    })
  );
}

export async function revokeExecToken(
  token: Pick<SandboxTokenPayload, "sbId" | "execId">
): Promise<void> {
  await runOnRedis({ origin: REDIS_ORIGIN }, (client) =>
    client.del(sandboxTokenRedisKey(token.sbId, token.execId))
  );
}

async function isExecTokenValid(
  token: Pick<SandboxTokenPayload, "sbId" | "execId">
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
    sandboxAction,
    expiryMs = 2 * 60 * 1000, // Default to 2 minutes
  }: {
    agentConfiguration: AgentLoopExecutionData["agentConfiguration"];
    agentMessage: AgentLoopExecutionData["agentMessage"];
    conversation: AgentLoopExecutionData["conversation"];
    sandbox: SandboxResource;
    execId: string;
    sandboxAction: AgentMCPActionType;
    expiryMs?: number;
  }
): Promise<string> {
  const payload: SandboxExecTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    cId: conversation.sId,
    uId: auth.user()?.sId,
    aId: agentConfiguration.sId,
    aV: agentConfiguration.version,
    mId: agentMessage.sId,
    sbId: sandbox.sId,
    actionId: sandboxAction.sId,
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

export async function generateSandboxFunctionInvocationToken(
  auth: Authenticator,
  {
    conversationId,
    sandbox,
    sandboxFunction,
    invocationId,
    execId,
    noTools,
    expiryMs = 2 * 60 * 1000, // Default to 2 minutes
  }: {
    conversationId?: string;
    sandbox: SandboxResource;
    sandboxFunction: { sId: string; space: { sId: string } };
    invocationId: string;
    execId: string;
    // Required rather than defaulted: a minting site that forgets it would silently hand out tool
    // access.
    noTools: boolean;
    expiryMs?: number;
  }
): Promise<string> {
  const payload: SandboxFunctionInvocationTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    uId: auth.user()?.sId,
    cId: conversationId,
    sbId: sandbox.sId,
    execId,
    spaceId: sandboxFunction.space.sId,
    sandboxFunctionId: sandboxFunction.sId,
    invocationId,
    ...(noTools ? { noTools: true as const } : {}),
  };

  await registerExecToken(payload);

  const secret = config.getSandboxJwtSecret();

  const token = jwt.sign(payload, secret, {
    algorithm: "HS256",
    expiresIn: expiryMs / 1000, // expiresIn is in seconds
  });

  return `${SANDBOX_TOKEN_PREFIX}${token}`;
}

export async function generateSandboxFileSystemToken(
  auth: Authenticator,
  {
    sandbox,
    mounts,
    expiryMs = 10 * 60 * 1000,
  }: {
    sandbox: SandboxResource;
    mounts: Array<{ kind: "conversation" | "pod"; id: string }>;
    expiryMs?: number;
  }
): Promise<string> {
  const payload: SandboxFileSystemTokenPayload = {
    wId: auth.getNonNullableWorkspace().sId,
    uId: auth.user()?.sId,
    sbId: sandbox.sId,
    execId: "filesystem",
    fsMounts: mounts,
  };

  await registerExecToken(payload);

  const token = jwt.sign(payload, config.getSandboxJwtSecret(), {
    algorithm: "HS256",
    expiresIn: expiryMs / 1000,
  });

  return `${SANDBOX_TOKEN_PREFIX}${token}`;
}

/**
 * Verify a sandbox exec token and check Redis-backed revocation.
 */
export async function verifySandboxExecToken(
  token: string
): Promise<SandboxTokenPayload | null> {
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

  const parseResult = SandboxTokenPayloadSchema.safeParse(rawPayload);
  if (!parseResult.success) {
    logger.error(
      { error: parseResult.error.flatten() },
      "Invalid sandbox exec token payload structure"
    );
    return null;
  }

  let payload = parseResult.data;
  const valid = await isExecTokenValid(payload);
  if (!valid) {
    logger.warn(
      { sbId: payload.sbId, execId: payload.execId },
      "Sandbox exec token revoked"
    );
    return null;
  }

  // Tokens issued before the agent-version claim was introduced remain valid
  // for pause/resume. Recover their immutable run version from the signed
  // conversation, message, and agent identifiers instead of falling back to
  // the agent's latest version.
  if (hasLegacySandboxExecTokenPayload(payload) && payload.aV === undefined) {
    const agentVersion = await resolveLegacySandboxExecAgentVersion(payload);
    if (agentVersion === null) {
      logger.warn(
        {
          agentId: payload.aId,
          agentMessageId: payload.mId,
          conversationId: payload.cId,
          workspaceId: payload.wId,
        },
        "Could not resolve the agent version for a legacy sandbox exec token"
      );
      return null;
    }
    payload = { ...payload, aV: agentVersion };
  }

  return payload;
}
