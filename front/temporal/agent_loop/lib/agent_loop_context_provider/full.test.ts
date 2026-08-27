import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { prepareFullContextProvider } from "@app/temporal/agent_loop/lib/agent_loop_context_provider/full";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("prepareFullContextProvider", () => {
  it("exposes metadata-only runtime data sliced at the requested step", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: userMessageRow, userMessage } =
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

    for (const step of [0, 1]) {
      await AgentStepContentResource.createNewVersion({
        workspaceId: workspace.id,
        agentMessageId: agentMessage.agentMessageId,
        step,
        index: 0,
        type: "text_content",
        value: {
          type: "text_content",
          value: `step ${step}`,
        },
      });
    }

    const result = await prepareFullContextProvider(
      auth,
      {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationTitle: conversation.title,
        userMessageId: userMessage.sId,
        userMessageVersion: userMessage.version,
        userMessageOrigin: userMessage.context.origin,
      },
      1
    );
    if (result.isErr()) {
      throw result.error;
    }

    expect("content" in result.value.runtimeData.conversation).toBe(false);
    expect(
      result.value.runtimeData.agentMessage.contents.map(({ step }) => step)
    ).toEqual([0]);
  });
});
