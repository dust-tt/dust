import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  generateSandboxExecToken,
  generateSandboxFunctionInvocationToken,
} from "@app/lib/api/sandbox/access_tokens";
import { Authenticator } from "@app/lib/auth";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMCPActionType } from "@app/types/actions";
import { sandboxFunctionContentType } from "@app/types/files";

process.env.DUST_SANDBOX_JWT_SECRET ??= "test-sandbox-jwt-secret";

export async function createSandboxTokenTestContext({
  disableComputerFeature = false,
}: {
  disableComputerFeature?: boolean;
} = {}) {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const { globalSpace } = await SpaceFactory.defaults(auth);

  if (disableComputerFeature) {
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
  }

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    requestedSpaceIds: [globalSpace.id],
  });
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [new Date()],
    requestedSpaceIds: [globalSpace.id],
  });
  const sandbox = await SandboxFactory.create(auth, conversation);

  const conversationResult = await getConversation(auth, conversation.sId);
  if (conversationResult.isErr()) {
    throw conversationResult.error;
  }

  const agentMessage = conversationResult.value.content
    .flat()
    .find((message) => message.type === "agent_message");
  if (!agentMessage) {
    throw new Error("Expected sandbox token test conversation agent message.");
  }

  const sandboxServer = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "sandbox",
    useCase: null,
  });

  const mockAction: AgentMCPActionType = {
    id: agentMessage.agentMessageId,
    sId: generateRandomModelSId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    agentMessageId: agentMessage.agentMessageId,
    internalMCPServerName: "search",
    toolName: "semantic_search",
    mcpServerId: sandboxServer.id,
    functionCallName: "semantic_search",
    functionCallId: generateRandomModelSId(),
    params: {
      query: "test query",
      relativeTimeFrame: "all",
      dataSources: [],
    },
    citationsAllocated: 0,
    status: "running",
    step: 0,
    executionDurationMs: null,
    displayLabels: null,
  };

  const token = await generateSandboxExecToken(auth, {
    agentConfiguration: agentConfig,
    agentMessage,
    conversation,
    sandbox,
    execId: `test-exec-${sandbox.sId}`,
    sandboxAction: mockAction,
  });

  return {
    auth,
    workspace,
    globalSpace,
    agentConfig,
    conversation,
    sandbox,
    agentMessage,
    token,
  };
}

export async function createSandboxFunctionInvocationTokenTestContext({
  disableComputerFeature = false,
}: {
  disableComputerFeature?: boolean;
} = {}) {
  const context = await createSandboxTokenTestContext({
    disableComputerFeature,
  });
  const token = await generateSandboxFunctionInvocationToken(context.auth, {
    sandbox: context.sandbox,
    sandboxFunction: {
      sId: "sfn_test",
      space: { sId: context.globalSpace.sId },
    },
    invocationId: `test-invocation-${context.sandbox.sId}`,
    execId: `test-function-exec-${context.sandbox.sId}`,
  });

  return {
    ...context,
    token,
  };
}

// Same as above but with a real sandbox function and invocation persisted, for flows that fetch
// them back (calling MCP tools from a function invocation).
export async function createPersistedSandboxFunctionInvocationTokenTestContext() {
  const context = await createSandboxTokenTestContext();
  const { auth, workspace } = context;

  const podSpace = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "greet.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: podSpace.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(auth, {
    space: podSpace,
    file,
    slug: "greet",
    description: "Greet someone.",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
    outputSchema: {
      type: "object",
      properties: { greeting: { type: "string" } },
      required: ["greeting"],
    },
  });
  const invocation = await SandboxFunctionInvocationResource.makeNew(auth, {
    sandboxFunction,
  });

  const token = await generateSandboxFunctionInvocationToken(auth, {
    sandbox: context.sandbox,
    sandboxFunction: {
      sId: sandboxFunction.sId,
      space: { sId: podSpace.sId },
    },
    invocationId: invocation.sId,
    execId: `test-function-exec-${context.sandbox.sId}`,
  });

  return {
    ...context,
    podSpace,
    sandboxFunction,
    invocation,
    token,
  };
}
