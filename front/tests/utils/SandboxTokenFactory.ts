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
import { AgentMCPServerConfigurationFactory } from "@app/tests/utils/AgentMCPServerConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { AgentMCPActionType } from "@app/types/actions";
import { sandboxFunctionContentType } from "@app/types/files";

process.env.DUST_SANDBOX_JWT_SECRET ??= "test-sandbox-jwt-secret";

export async function createSandboxTokenTestContext({
  disableComputerFeature = false,
  usePodSpaceForConversation = false,
}: {
  disableComputerFeature?: boolean;
  usePodSpaceForConversation?: boolean;
} = {}) {
  const user = await UserFactory.basic();
  const workspace = await WorkspaceFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });

  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const { globalSpace } = await SpaceFactory.defaults(auth);
  const conversationSpace = usePodSpaceForConversation
    ? await SpaceFactory.project(workspace, user.id)
    : globalSpace;
  const agentSpace = usePodSpaceForConversation
    ? await SpaceFactory.regular(workspace)
    : globalSpace;

  if (usePodSpaceForConversation) {
    const addMemberResult = await agentSpace.addMembers(auth, {
      userIds: [user.sId],
    });
    if (addMemberResult.isErr()) {
      throw addMemberResult.error;
    }
  }

  if (disableComputerFeature) {
    await FeatureFlagFactory.basic(auth, "disable_computer_feature");
  }

  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
    requestedSpaceIds: [agentSpace.id],
  });
  let agentServerView = null;
  if (usePodSpaceForConversation) {
    const agentServer = await RemoteMCPServerFactory.create(workspace, {
      name: "agent_space_server",
    });
    agentServerView = await MCPServerViewFactory.create(
      workspace,
      agentServer.sId,
      agentSpace
    );
    await AgentMCPServerConfigurationFactory.create(auth, agentSpace, {
      agent: agentConfig,
      mcpServerView: agentServerView,
    });
  }
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [new Date()],
    requestedSpaceIds: [conversationSpace.id],
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
    agentSpace,
    agentServerView,
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
    noTools: false,
    sandbox: context.sandbox,
    sandboxFunction: {
      sId: "sfn_test",
    },
    owner: { kind: "pod", spaceId: context.globalSpace.sId },
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
export async function createPersistedSandboxFunctionInvocationTokenTestContext({
  noTools = false,
  tokenOwnerKind = "pod",
}: {
  noTools?: boolean;
  // The persisted function stays Pod-owned. Frame-claim route tests return before resolving it.
  tokenOwnerKind?: "pod" | "frame";
} = {}) {
  const context = await createSandboxTokenTestContext();
  const { workspace } = context;

  // Make the user a member of the pod space and refresh the auth so its groups include the pod
  // editor group, matching production where the invocation-token auth is granted the pod space
  // groups (pod-scoped writes like DustFileSystem.forPod require read access on the space).
  const user = context.auth.getNonNullableUser();
  const podSpace = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

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
    // A token that denies tools only ever belongs to a function published as fast.
    executionMode: noTools ? "fast" : "durable",
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
    input: undefined,
  });

  const token = await generateSandboxFunctionInvocationToken(auth, {
    sandbox: context.sandbox,
    sandboxFunction: {
      sId: sandboxFunction.sId,
    },
    owner:
      tokenOwnerKind === "frame"
        ? { kind: "frame", frameId: file.sId, spaceId: podSpace.sId }
        : { kind: "pod", spaceId: podSpace.sId },
    invocationId: invocation.sId,
    execId: `test-function-exec-${context.sandbox.sId}`,
    noTools,
  });

  return {
    ...context,
    auth,
    podSpace,
    sandboxFunction,
    invocation,
    token,
  };
}
