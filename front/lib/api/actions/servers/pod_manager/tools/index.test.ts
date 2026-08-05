import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { createProjectManagerTools } from "@app/lib/api/actions/servers/pod_manager/tools";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getTestStreamEndpoint } from "@app/tests/utils/models";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import assert from "assert";
import { describe, expect, it } from "vitest";
import { z } from "zod";

const CreateConversationOutputSchema = z.object({
  conversationId: z.string(),
});

describe("pod_manager create_conversation", () => {
  it("creates a top-level conversation from a nested agent conversation", async () => {
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

    const userMessage = parentConversation.content
      .flat()
      .find(isUserMessageType);
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
    const tool = createProjectManagerTools(auth, { runContext }).find(
      ({ name }) => name === "create_conversation"
    );
    assert(tool);

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
    const result = await tool.handler(
      {
        message: "A completed update",
        title: "Nested agent update",
      },
      extra
    );

    assert(result.isOk());
    const content = result.value[0];
    assert(content?.type === "text");
    const output = CreateConversationOutputSchema.parse(
      JSON.parse(content.text)
    );
    const createdConversation = await ConversationResource.fetchById(
      auth,
      output.conversationId
    );

    assert(createdConversation);
    expect(createdConversation.depth).toBe(0);
    expect(createdConversation.spaceId).toBe(pod.id);
  });
});
