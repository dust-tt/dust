import { makePodConfigurationURI } from "@app/lib/actions/mcp_internal_actions/pod_configuration_uri";
import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { createProjectManagerTools } from "@app/lib/api/actions/servers/pod_manager/tools";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { processEventForDatabase } from "@app/temporal/agent_loop/activities/common";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { getAgentLoopRuntimeData } from "@app/types/assistant/agent_run";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { frameContentType } from "@app/types/files";
import { DEFAULT_POD_FILE_TAB_ICON } from "@app/types/pod_file_tab";
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
    const agentLoopData = await getAgentLoopRuntimeData(
      auth.toJSON(),
      agentLoopArgs
    );
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

describe("pod_manager set_file_tabs / get_information file tabs", () => {
  async function setupPodWithPreviewableFile() {
    const {
      authenticator: auth,
      user,
      workspace,
    } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace, user.id);
    await auth.refresh();

    const file = await ProjectFileFactory.create(auth, user, pod, {
      contentType: frameContentType,
      fileName: "Dashboard.tsx",
      fileSize: 100,
      status: "ready",
    });
    const path = file.toScopedPath(auth);
    assert(path);

    const tools = createProjectManagerTools(auth);
    const extra = {
      auth,
      requestId: "pod-manager-file-tabs-test",
      sendNotification: async () => {},
      sendRequest: async () => {
        throw new Error("Unexpected MCP request");
      },
      signal: new AbortController().signal,
    } as ToolHandlerExtra;

    return { auth, extra, path, pod, tools, workspace };
  }

  it("sets file tabs and surfaces them on get_information", async () => {
    const { auth, extra, path, pod, tools, workspace } =
      await setupPodWithPreviewableFile();

    const dustPod = {
      uri: makePodConfigurationURI(workspace.sId, pod.sId),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
    };

    const setResult = await getTool(tools, "set_file_tabs").handler(
      {
        fileTabs: [{ path, title: "Ops board" }],
        dustPod,
      },
      extra
    );
    assert(setResult.isOk());
    const setContent = setResult.value[0];
    assert(setContent?.type === "text");
    const setOutput = z
      .object({
        success: z.boolean(),
        fileTabs: z.array(
          z.object({
            path: z.string(),
            title: z.string(),
            icon: z.string(),
          })
        ),
        tabsOrder: z.array(z.string()),
      })
      .parse(JSON.parse(setContent.text));

    expect(setOutput.success).toBe(true);
    expect(setOutput.fileTabs).toEqual([
      {
        path,
        title: "Ops board",
        icon: DEFAULT_POD_FILE_TAB_ICON,
      },
    ]);
    expect(setOutput.tabsOrder).toContain(path);

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    expect(metadata?.frameTabs).toEqual([
      {
        path,
        title: "Ops board",
        icon: DEFAULT_POD_FILE_TAB_ICON,
      },
    ]);

    const getResult = await getTool(tools, "get_information").handler(
      { dustPod },
      extra
    );
    assert(getResult.isOk());
    const getContent = getResult.value[0];
    assert(getContent?.type === "text");
    const getOutput = z
      .object({
        pod: z.object({
          fileTabs: z.array(
            z.object({
              path: z.string(),
              title: z.string(),
              icon: z.string(),
            })
          ),
          tabsOrder: z.array(z.string()),
          pinnedFramePath: z.string().nullable(),
        }),
      })
      .parse(JSON.parse(getContent.text));

    expect(getOutput.pod.fileTabs).toEqual([
      {
        path,
        title: "Ops board",
        icon: DEFAULT_POD_FILE_TAB_ICON,
      },
    ]);
    expect(getOutput.pod.tabsOrder).toEqual(
      expect.arrayContaining(["conversations", "files", "tasks", path])
    );
  });

  it("clears file tabs when passed an empty list", async () => {
    const { auth, extra, path, pod, tools, workspace } =
      await setupPodWithPreviewableFile();

    const dustPod = {
      uri: makePodConfigurationURI(workspace.sId, pod.sId),
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
    };

    const setResult = await getTool(tools, "set_file_tabs").handler(
      {
        fileTabs: [{ path }],
        dustPod,
      },
      extra
    );
    assert(setResult.isOk());

    const clearResult = await getTool(tools, "set_file_tabs").handler(
      {
        fileTabs: [],
        dustPod,
      },
      extra
    );
    assert(clearResult.isOk());

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    expect(metadata?.frameTabs).toEqual([]);
  });

  it("rejects an invalid icon", async () => {
    const { extra, path, pod, tools, workspace } =
      await setupPodWithPreviewableFile();

    const result = await getTool(tools, "set_file_tabs").handler(
      {
        fileTabs: [{ path, icon: "NotARealIcon" }],
        dustPod: {
          uri: makePodConfigurationURI(workspace.sId, pod.sId),
          mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_POD,
        },
      },
      extra
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Invalid file tab icon");
    }
  });
});
