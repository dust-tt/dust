import { getConversationForCheckpoint } from "@app/lib/api/assistant/conversation_rendering/checkpoint_conversation";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { isAgentMessageType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

describe("getConversationForCheckpoint", () => {
  it("hydrates output content only for the latest completed step", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
      });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );

    for (const step of [0, 1, 2]) {
      await AgentStepContentResource.createNewVersion({
        workspaceId: workspace.id,
        agentMessageId: agentMessage.agentMessageId,
        step,
        index: 100,
        type: "text_content",
        value: { type: "text_content", value: `step ${step} text` },
      });
      await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessage.agentMessageId,
        status: "succeeded",
        step,
        output: [{ type: "text", text: `step ${step} output` }],
      });
    }
    const { agentMessage: otherAgentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
        parentMessageModelId: userMessageRow.id,
        rank: 2,
      });

    const result = await getConversationForCheckpoint(auth, conversation.sId, {
      agentMessageId: agentMessage.sId,
      targetStep: 2,
      userMessageId: userMessageRow.sId,
    });
    if (result.isErr()) {
      throw result.error;
    }

    const renderedAgentMessage = result.value.content
      .flat()
      .find(isAgentMessageType);
    expect(renderedAgentMessage).toBeDefined();
    expect(renderedAgentMessage?.sId).toBe(agentMessage.sId);
    expect(result.value.content.flat().map(({ sId }) => sId)).toEqual([
      userMessageRow.sId,
      agentMessage.sId,
    ]);
    expect(
      result.value.content
        .flat()
        .find((message) => message.sId === otherAgentMessage.sId)
    ).toBeUndefined();
    expect(
      renderedAgentMessage?.actions.find(({ step }) => step === 0)?.output
    ).toEqual([]);
    expect(
      renderedAgentMessage?.actions.find(({ step }) => step === 1)?.output
    ).toEqual([{ type: "text", text: "step 1 output" }]);
    expect(
      renderedAgentMessage?.actions.find(({ step }) => step === 2)
    ).toBeUndefined();
    expect(
      renderedAgentMessage?.contents
        .filter(({ content }) => content.type === "text_content")
        .map(({ content }) => content)
    ).toEqual([
      { type: "text_content", value: "step 0 text" },
      { type: "text_content", value: "step 1 text" },
    ]);
  });

  it("returns no step state before the first step", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
      });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );
    await AgentStepContentResource.createNewVersion({
      workspaceId: workspace.id,
      agentMessageId: agentMessage.agentMessageId,
      step: 0,
      index: 100,
      type: "text_content",
      value: { type: "text_content", value: "step 0 text" },
    });
    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      step: 0,
      output: [{ type: "text", text: "step 0 output" }],
    });

    const result = await getConversationForCheckpoint(auth, conversation.sId, {
      agentMessageId: agentMessage.sId,
      targetStep: 0,
      userMessageId: userMessageRow.sId,
    });
    if (result.isErr()) {
      throw result.error;
    }

    const renderedAgentMessage = result.value.content
      .flat()
      .find(isAgentMessageType);
    expect(renderedAgentMessage?.actions).toEqual([]);
    expect(renderedAgentMessage?.contents).toEqual([]);
  });
});
