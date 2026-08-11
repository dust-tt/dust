import { makePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  AgentLoopRunContext,
  SandboxFunctionRunContext,
} from "@app/lib/actions/types";
import { createProjectManagerTools } from "@app/lib/api/actions/servers/pod_manager/tools";
import config from "@app/lib/api/config";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import { processEventForDatabase } from "@app/temporal/agent_loop/activities/common";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { createPersistedSandboxFunctionInvocationTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { getAgentLoopData } from "@app/types/assistant/agent_run";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import assert from "assert";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const CreateConversationOutputSchema = z.object({
  conversationId: z.string(),
});

const ListConversationsOutputSchema = z.object({
  conversations: z.array(
    z.object({
      sId: z.string(),
    })
  ),
});

const ListConversationsWithMessagesOutputSchema = z.object({
  conversations: z.array(
    z.object({
      sId: z.string(),
      conversationUrl: z.string(),
      url: z.string(),
    })
  ),
});

function getTool(
  tools: ReturnType<typeof createProjectManagerTools>,
  name: string
) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert(tool);
  return tool;
}

async function createConversationFromNestedAgent() {
  const {
    authenticator: auth,
    user,
    workspace,
  } = await createResourceTest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);
  await auth.refresh();

  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const parentConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [new Date()],
    spaceId: pod.id,
    depth: 2,
  });

  const userMessage = parentConversation.content.flat().find(isUserMessageType);
  const agentMessage = parentConversation.content
    .flat()
    .find(isAgentMessageType);
  assert(userMessage);
  assert(agentMessage);

  const { action } = await AgentMCPActionFactory.create(auth, {
    workspace,
    conversationModelId: parentConversation.id,
    agentMessageModelId: agentMessage.agentMessageId,
    functionCallName: "create_conversation",
    toolName: "create_conversation",
    mcpServerName: "pod_manager",
  });
  const { model, ...agentConfiguration } = agent;
  const runContext: AgentLoopRunContext = {
    contextType: "agent_loop",
    action,
    agentConfiguration,
    modelInfo: {
      endpoint: getTestStreamEndpoint(model.modelId),
      ...model,
    },
    agentMessage,
    conversation: parentConversation,
    stepContext: {
      citationsCount: 0,
      citationsOffset: 0,
      retrievalTopK: 10,
      resumeState: null,
      websearchResultCount: 0,
    },
    toolConfiguration: action.toolConfiguration,
    userMessage,
  };
  const tools = createProjectManagerTools(auth, { runContext });
  const extra: ToolHandlerExtra = {
    auth,
    requestId: "pod-manager-create-conversation-test",
    runContext,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };
  const result = await getTool(tools, "create_conversation").handler(
    {
      message: "A completed update",
      title: "Nested agent update",
    },
    extra
  );

  assert(result.isOk());
  const content = result.value[0];
  assert(content?.type === "text");
  const output = CreateConversationOutputSchema.parse(JSON.parse(content.text));
  const createdConversation = await ConversationResource.fetchById(
    auth,
    output.conversationId
  );
  assert(createdConversation);

  return {
    agent,
    auth,
    createdConversation,
    extra,
    parentConversation,
    pod,
    runContext,
    tools,
    user,
    workspace,
  };
}

describe("pod_manager create_conversation", () => {
  it("creates a top-level conversation from a nested agent conversation", async () => {
    const { createdConversation, pod } =
      await createConversationFromNestedAgent();

    expect(createdConversation.depth).toBe(0);
    expect(createdConversation.spaceId).toBe(pod.id);
  });

  it("makes a nested agent's new conversation visible in the Pod conversation list", async () => {
    const { createdConversation, extra, tools } =
      await createConversationFromNestedAgent();
    const result = await getTool(tools, "list_conversations").handler(
      {},
      extra
    );

    assert(result.isOk());
    const content = result.value[0];
    assert(content?.type === "text");
    const output = ListConversationsOutputSchema.parse(
      JSON.parse(content.text)
    );

    expect(
      output.conversations.map((conversation) => conversation.sId)
    ).toContain(createdConversation.sId);
  });

  it("returns an absolute conversationUrl (and the deprecated relative url) with includeMessages", async () => {
    const { createdConversation, extra, tools, workspace } =
      await createConversationFromNestedAgent();
    const result = await getTool(tools, "list_conversations").handler(
      { includeMessages: true },
      extra
    );

    assert(result.isOk());
    const content = result.value[0];
    assert(content?.type === "text");
    const output = ListConversationsWithMessagesOutputSchema.parse(
      JSON.parse(content.text)
    );

    const listedConversation = output.conversations.find(
      (conversation) => conversation.sId === createdConversation.sId
    );
    assert(listedConversation);
    expect(listedConversation.conversationUrl).toBe(
      getConversationRoute(
        workspace.sId,
        createdConversation.sId,
        undefined,
        config.getAppUrl()
      )
    );
    expect(listedConversation.url).toBe(
      `/w/${workspace.sId}/assistant/${createdConversation.sId}`
    );
  });
});

describe("pod_manager move_conversation", () => {
  it("moves the current conversation and lets its agent loop complete", async () => {
    const {
      auth,
      extra,
      parentConversation,
      runContext,
      tools,
      user,
      workspace,
    } = await createConversationFromNestedAgent();
    const targetPod = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();
    await ConversationResource.setIsRunningAgentLoop(auth, {
      conversation: parentConversation,
      isRunningAgentLoop: true,
    });

    const result = await getTool(tools, "move_conversation").handler(
      {
        destination: "pod",
        dustPod: {
          uri: makePodConfigurationURI(workspace.sId, targetPod.sId),
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
        },
      },
      extra
    );

    expect(result.isOk()).toBe(true);
    const movedConversation = await ConversationResource.fetchById(
      auth,
      parentConversation.sId
    );
    expect(movedConversation?.toJSON().spaceId).toBe(targetPod.sId);

    const agentLoopArgs = {
      agentMessageId: runContext.agentMessage.sId,
      agentMessageVersion: runContext.agentMessage.version,
      conversationId: parentConversation.sId,
      conversationTitle: parentConversation.title,
      userMessageId: runContext.userMessage.sId,
      userMessageVersion: runContext.userMessage.version,
      userMessageOrigin: runContext.userMessage.context.origin,
    };
    const agentLoopData = await getAgentLoopData(auth.toJSON(), agentLoopArgs);
    assert(agentLoopData.isOk());
    expect(agentLoopData.value.conversation.spaceId).toBe(targetPod.sId);

    const shouldPublish = await processEventForDatabase(auth, {
      event: {
        type: "agent_message_success",
        created: Date.now(),
        configurationId: agentLoopData.value.agentConfiguration.sId,
        messageId: agentLoopData.value.agentMessage.sId,
        message: agentLoopData.value.agentMessage,
        runIds: [],
      },
      agentMessage: agentLoopData.value.agentMessage,
      conversation: agentLoopData.value.conversation,
      step: 1,
    });
    expect(shouldPublish).toBe(true);

    const completedConversation = await ConversationResource.fetchById(
      auth,
      parentConversation.sId
    );
    expect(completedConversation?.isRunningAgentLoop).toBe(false);
  });

  it("still rejects another conversation whose agent loop is running", async () => {
    const { agent, auth, extra, tools, user, workspace } =
      await createConversationFromNestedAgent();
    const targetPod = await SpaceFactory.project(workspace, user.id);
    const otherConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await auth.refresh();
    await ConversationResource.setIsRunningAgentLoop(auth, {
      conversation: otherConversation,
      isRunningAgentLoop: true,
    });

    const result = await getTool(tools, "move_conversation").handler(
      {
        destination: "pod",
        conversationId: otherConversation.sId,
        dustPod: {
          uri: makePodConfigurationURI(workspace.sId, targetPod.sId),
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
        },
      },
      extra
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "Wait for the agent to finish before moving this conversation."
      );
    }
    const unmovedConversation = await ConversationResource.fetchById(
      auth,
      otherConversation.sId
    );
    expect(unmovedConversation?.toJSON().spaceId).toBeNull();
  });
});

async function createSandboxFunctionToolsContext() {
  const context =
    await createPersistedSandboxFunctionInvocationTokenTestContext();
  const { auth, workspace, globalSpace, invocation } = context;
  const server = await InternalMCPServerInMemoryResource.makeNew(auth, {
    name: "common_utilities",
    useCase: null,
  });
  const view = await MCPServerViewFactory.create(
    workspace,
    server.id,
    globalSpace
  );
  const action = await SandboxFunctionMCPActionFactory.create(auth, {
    invocation,
    mcpServerView: view,
  });
  const runContext: SandboxFunctionRunContext = {
    contextType: "sandbox_function",
    action,
    invocation,
    toolConfiguration: action.toolConfiguration,
  };
  const tools = createProjectManagerTools(auth, { runContext });
  const extra: ToolHandlerExtra = {
    auth,
    requestId: "pod-manager-sandbox-function-test",
    runContext,
    sendNotification: async () => {},
    sendRequest: async () => {
      throw new Error("Unexpected MCP request");
    },
    signal: new AbortController().signal,
  };

  return { ...context, extra, tools };
}

describe("pod_manager tools from a sandbox-function run context", () => {
  it("denies create_conversation with a typed error", async () => {
    const { extra, tools } = await createSandboxFunctionToolsContext();

    const result = await getTool(tools, "create_conversation").handler(
      {
        message: "Spawned from a function",
        title: "Not allowed",
      },
      extra
    );

    assert(result.isErr());
    expect(result.error.message).toContain(
      "Creating conversations or invoking agents from a Pod function is not supported"
    );
  });

  it("denies add_message_to_conversation with a typed error", async () => {
    const { extra, tools } = await createSandboxFunctionToolsContext();

    const result = await getTool(tools, "add_message_to_conversation").handler(
      {
        conversationId: "cnv_never_looked_up",
        message: "Spawned from a function",
      },
      extra
    );

    assert(result.isErr());
    expect(result.error.message).toContain(
      "Creating conversations or invoking agents from a Pod function is not supported"
    );
  });

  it("still allows the read-only list_conversations", async () => {
    const { agentConfig, auth, extra, podSpace, tools } =
      await createSandboxFunctionToolsContext();
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
      spaceId: podSpace.id,
    });

    const result = await getTool(tools, "list_conversations").handler(
      {},
      extra
    );

    assert(result.isOk());
    const content = result.value[0];
    assert(content?.type === "text");
    const output = ListConversationsOutputSchema.parse(
      JSON.parse(content.text)
    );

    expect(
      output.conversations.map((listedConversation) => listedConversation.sId)
    ).toContain(conversation.sId);
  });
});
