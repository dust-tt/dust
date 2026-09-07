#!/usr/bin/env tsx
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { SANDBOX_TOOL_NAME } from "@app/lib/api/actions/servers/sandbox/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import config from "@app/lib/api/config";
import {
  generateExecId,
  generateSandboxExecToken,
  generateSandboxFunctionInvocationToken,
} from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { ConversationParticipantModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { SandboxOwnerModel } from "@app/lib/resources/storage/models/sandbox";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { Logger } from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import type { AgentMessageType } from "@app/types/assistant/conversation";
import { isDevelopment } from "@app/types/shared/env";
import type { ModelId } from "@app/types/shared/model_id";

// Operator-only escape hatch for manual `dsbx` debugging: sandbox tokens are minted per
// `SandboxResource.exec()` (or per function invocation), so a shell attached with
// scripts/sandbox_exec.ts has no DUST_SANDBOX_TOKEN. This mints one out-of-band (JWT +
// the Redis registration `verifySandboxExecToken` requires) and prints the two env vars
// `dsbx` reads. Runtime app code must keep minting tokens on the exec paths.
//
//   npx tsx scripts/sandbox_token.ts -s <sandbox-id> [--userEmail me@dust.tt] --execute
//
// Caveats, by token kind:
// - Conversation sandbox (exec token): listing (`dsbx tools`) only needs the agent
//   configuration version to exist, but calling a tool goes through
//   `createSandboxChildAction`, which rejects a parent action in a final status. So tool
//   calls only work while the resolved bash action is still running.
// - Pod sandbox (function invocation token): listing only needs the pod space, but calling a
//   tool resolves the function and invocation claims, so the token borrows the pod's most
//   recent invocation. A pod that never ran a function gets placeholder ids: listing only.

const DEFAULT_EXPIRY_MINUTES = 60;

function dustAPIBaseUrlForSandbox(): string {
  return isDevelopment() && config.getSandboxDevFrontHostName()
    ? `https://${config.getSandboxDevFrontHostName()}`
    : config.getApiBaseUrl();
}

function printEnv({
  token,
  workspaceId,
}: {
  token: string;
  workspaceId: string;
}): void {
  const apiUrl = `${dustAPIBaseUrlForSandbox()}/api/v1/w/${workspaceId}`;
  process.stdout.write(
    `\nexport DUST_SANDBOX_TOKEN='${token}'\nexport DUST_API_URL='${apiUrl}'\n\n`
  );
}

/**
 * Resolve the sandbox from either its Dust sId or its provider (E2B) id — the latter is
 * what scripts/sandbox_exec.ts takes, and is usually all the operator has.
 */
async function fetchSandbox(
  sandboxId: string
): Promise<{ sandbox: SandboxResource; auth: Authenticator } | null> {
  const sandboxModelId = isResourceSId("sandbox", sandboxId)
    ? getResourceIdFromSId(sandboxId)
    : null;

  const row = await SandboxResource.model.findOne({
    where:
      sandboxModelId !== null
        ? { id: sandboxModelId }
        : { providerId: sandboxId },
    // WORKSPACE_ISOLATION_BYPASS: a provider sandbox id does not carry a workspace, and the
    // operator debugging a sandbox only has that id.
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
  });

  if (!row) {
    return null;
  }

  const [workspace] = await WorkspaceResource.fetchByModelIds([
    row.workspaceId,
  ]);
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const sandbox = await SandboxResource.fetchByModelIdForWorkspace(
    auth,
    row.id
  );
  if (!sandbox) {
    return null;
  }

  return { sandbox, auth };
}

/**
 * Build the Authenticator the token is minted from: its user becomes the `uId` claim and
 * its groups gate which spaces the sandbox sees. Falls back to `fallbackUserModelId` (the
 * conversation participant, mirroring the real token), then to a userless token, which is
 * restricted to the workspace global group.
 */
async function authForToken(
  adminAuth: Authenticator,
  {
    userEmail,
    fallbackUserModelId,
  }: { userEmail: string | undefined; fallbackUserModelId?: ModelId },
  logger: Logger
): Promise<Authenticator | null> {
  const user = userEmail
    ? await UserResource.fetchByEmail(userEmail)
    : ((fallbackUserModelId !== undefined
        ? await UserResource.fetchByModelIds([fallbackUserModelId])
        : [])[0] ?? null);

  if (!user) {
    if (userEmail) {
      logger.error({ userEmail }, "User not found");
      return null;
    }
    logger.warn(
      "No user resolved: minting a userless token, which only sees global space servers."
    );
    return adminAuth;
  }

  return Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    adminAuth.getNonNullableWorkspace().sId
  );
}

async function mintExecToken(
  adminAuth: Authenticator,
  {
    sandbox,
    conversationModelId,
    userEmail,
    expiryMinutes,
    execute,
  }: {
    sandbox: SandboxResource;
    conversationModelId: number;
    userEmail: string | undefined;
    expiryMinutes: number;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  const [conversationResource] = await ConversationResource.fetchByModelIds(
    adminAuth,
    [conversationModelId]
  );
  if (!conversationResource) {
    logger.error("Owning conversation not found");
    return;
  }

  // Unlisted conversations are participant-only, so the conversation is read as the user
  // the token will carry rather than as an internal admin.
  const participant = await ConversationParticipantModel.findOne({
    where: {
      conversationId: conversationModelId,
      workspaceId: adminAuth.getNonNullableWorkspace().id,
    },
    order: [["id", "ASC"]],
  });

  const auth = await authForToken(
    adminAuth,
    { userEmail, fallbackUserModelId: participant?.userId },
    logger
  );
  if (!auth) {
    return;
  }

  // The token claims need the last agent message and its sandbox action, which only the
  // full fetch renders.
  // biome-ignore lint/plugin/noExpensiveConversationFetch: intentional full conversation load
  const conversationResult = await getConversation(
    auth,
    conversationResource.sId
  );
  if (conversationResult.isErr()) {
    logger.error({ err: conversationResult.error }, "Cannot read conversation");
    return;
  }
  const conversation = conversationResult.value;

  const agentMessages = conversation.content
    .flat()
    .filter((message): message is AgentMessageType => {
      return message.type === "agent_message";
    });
  // The claims must come from a message that ran bash: the `actionId` claim has to point at
  // a sandbox action, which is not necessarily on the latest message.
  const agentMessage = agentMessages.findLast((message) =>
    message.actions.some(
      (action) => action.internalMCPServerName === SANDBOX_TOOL_NAME
    )
  );
  if (!agentMessage) {
    logger.error(
      { conversationId: conversation.sId },
      "No agent message ran a sandbox action in this conversation"
    );
    return;
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentMessage.configuration.sId,
    agentVersion: agentMessage.configuration.version,
    variant: "full",
  });
  if (!agentConfiguration) {
    logger.error(
      {
        agentId: agentMessage.configuration.sId,
        agentVersion: agentMessage.configuration.version,
      },
      "Agent configuration version not found — the token would fail to authenticate"
    );
    return;
  }

  const sandboxAction = agentMessage.actions.findLast(
    (action) => action.internalMCPServerName === SANDBOX_TOOL_NAME
  );
  if (!sandboxAction) {
    logger.error(
      { agentMessageId: agentMessage.sId },
      "No sandbox action on the resolved agent message"
    );
    return;
  }
  if (isToolExecutionStatusFinal(sandboxAction.status)) {
    logger.warn(
      { actionId: sandboxAction.sId, actionStatus: sandboxAction.status },
      "Parent sandbox action is final: `dsbx tools` can list, but tool calls will be rejected"
    );
  }

  const execId = generateExecId();
  logger.info(
    {
      conversationId: conversation.sId,
      agentId: agentConfiguration.sId,
      agentVersion: agentConfiguration.version,
      agentMessageId: agentMessage.sId,
      actionId: sandboxAction.sId,
      sandboxId: sandbox.sId,
      execId,
      userId: auth.user()?.sId,
    },
    "Resolved exec token claims"
  );

  if (!execute) {
    return;
  }

  const token = await generateSandboxExecToken(auth, {
    agentConfiguration,
    agentMessage,
    conversation,
    sandbox,
    execId,
    sandboxAction,
    expiryMs: expiryMinutes * 60 * 1000,
  });

  printEnv({ token, workspaceId: auth.getNonNullableWorkspace().sId });
}

/**
 * The `/call` endpoint resolves the token's function and invocation claims, so calling a tool
 * needs both rows to exist. Borrow the identity of the pod's most recent invocation rather
 * than writing one: any invocation of any function in the pod satisfies the lookups, and the
 * debug child action is attributed to it. Falls back to placeholder ids, which still list
 * tools (the listing path only resolves the pod space).
 */
async function resolveInvocationIdentity(
  auth: Authenticator,
  pod: SpaceResource,
  logger: Logger
): Promise<{
  sandboxFunctionId: string;
  invocationId: string;
  real: boolean;
}> {
  const sandboxFunctions = await SandboxFunctionResource.listBySpace(auth, pod);

  // One query per function, bounded by the handful of functions a pod publishes, and it stops
  // at the first function that has ever been invoked.
  for (const sandboxFunction of sandboxFunctions) {
    const [invocation] = await SandboxFunctionInvocationResource.listRecent(
      auth,
      { sandboxFunction, limit: 1 }
    );
    if (invocation) {
      return {
        sandboxFunctionId: sandboxFunction.sId,
        invocationId: invocation.sId,
        real: true,
      };
    }
  }

  logger.warn(
    { podId: pod.sId, functionCount: sandboxFunctions.length },
    "No pod function invocation to borrow: `dsbx tools` can list, but tool calls will be " +
      "rejected with `Pod function not found`"
  );

  return {
    sandboxFunctionId: generateRandomModelSId(),
    invocationId: generateRandomModelSId(),
    real: false,
  };
}

async function mintFunctionInvocationToken(
  adminAuth: Authenticator,
  {
    sandbox,
    spaceModelId,
    userEmail,
    expiryMinutes,
    execute,
  }: {
    sandbox: SandboxResource;
    spaceModelId: number;
    userEmail: string | undefined;
    expiryMinutes: number;
    execute: boolean;
  },
  logger: Logger
): Promise<void> {
  const [pod] = await SpaceResource.fetchByModelIds(adminAuth, [spaceModelId]);
  if (!pod) {
    logger.error("Owning pod space not found");
    return;
  }

  const auth = await authForToken(adminAuth, { userEmail }, logger);
  if (!auth) {
    return;
  }

  const identity = await resolveInvocationIdentity(auth, pod, logger);
  const execId = generateExecId();
  const sandboxFunction = {
    sId: identity.sandboxFunctionId,
    space: { sId: pod.sId },
  };
  const { invocationId } = identity;

  logger.info(
    {
      podId: pod.sId,
      sandboxId: sandbox.sId,
      sandboxFunctionId: sandboxFunction.sId,
      invocationId,
      real: identity.real,
      execId,
      userId: auth.user()?.sId,
    },
    "Resolved function invocation token claims"
  );

  if (!execute) {
    return;
  }

  const token = await generateSandboxFunctionInvocationToken(auth, {
    sandbox,
    sandboxFunction,
    owner: { kind: "pod", spaceId: pod.sId },
    invocationId,
    execId,
    noTools: false,
    expiryMs: expiryMinutes * 60 * 1000,
  });

  printEnv({ token, workspaceId: auth.getNonNullableWorkspace().sId });
}

makeScript(
  {
    sandboxId: {
      type: "string",
      alias: "s",
      demandOption: true,
      description:
        "Provider (E2B) sandbox id — same value as scripts/sandbox_exec.ts -s — or the Dust sandbox sId",
    },
    userEmail: {
      type: "string",
      description:
        "Email of the workspace member to mint the token as; defaults to the conversation participant, then to a userless token",
    },
    expiryMinutes: {
      type: "number",
      default: DEFAULT_EXPIRY_MINUTES,
      description:
        "Token JWT lifetime; the Redis registration that gates it lives 24h",
    },
  },
  async ({ sandboxId, userEmail, expiryMinutes, execute }, logger) => {
    const fetched = await fetchSandbox(sandboxId);
    if (!fetched) {
      logger.error({ sandboxId }, "Sandbox not found");
      return;
    }
    const { sandbox, auth: adminAuth } = fetched;

    if (sandbox.status === "deleted") {
      logger.error(
        { sandboxId: sandbox.sId },
        "Sandbox is deleted — its exec tokens are revoked"
      );
      return;
    }

    const owner = await SandboxOwnerModel.findOne({
      where: {
        sandboxId: sandbox.id,
        workspaceId: adminAuth.getNonNullableWorkspace().id,
      },
    });
    if (!owner) {
      logger.error({ sandboxId: sandbox.sId }, "Sandbox has no owner link");
      return;
    }

    if (owner.conversationId !== null) {
      await mintExecToken(
        adminAuth,
        {
          sandbox,
          conversationModelId: owner.conversationId,
          userEmail,
          expiryMinutes,
          execute,
        },
        logger
      );
      return;
    }

    if (owner.spaceId !== null) {
      await mintFunctionInvocationToken(
        adminAuth,
        {
          sandbox,
          spaceModelId: owner.spaceId,
          userEmail,
          expiryMinutes,
          execute,
        },
        logger
      );
      return;
    }

    logger.error(
      { sandboxId: sandbox.sId },
      "Sandbox owner link has neither a conversation nor a space"
    );
  }
);
