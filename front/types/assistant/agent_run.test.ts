import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  getAgentLoopRuntimeDataWithAuth,
  isAgentLoopDataModelNotFoundError,
} from "@app/types/assistant/agent_run";
import { AUTO_MODEL_ID } from "@app/types/assistant/models/auto";
import { describe, expect, it } from "vitest";

describe("getAgentLoopRuntimeDataWithAuth", () => {
  it("resolves an auto stream for a legacy message without a stored model", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      model: {
        providerId: AUTO_MODEL_ID,
        modelId: AUTO_MODEL_ID,
      },
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
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
        agentConfig,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );

    expect(agentMessage.resolvedModel).toBeNull();

    const result = await getAgentLoopRuntimeDataWithAuth(auth, {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    });

    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value.agentMessage.resolvedModel).toBeNull();
    expect("content" in result.value.conversation).toBe(false);
    expect(result.value.modelInfo.endpoint.modelConfig.modelId).not.toBe(
      AUTO_MODEL_ID
    );
  });

  it("returns a typed model-not-found error for a retired model id", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
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
        agentConfig,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      }
    );

    await AgentConfigurationModel.update(
      {
        // @ts-expect-error retired EAP ids are no longer ModelIdType
        modelId: "claude-smores-eap",
      },
      { where: { sId: agentConfig.sId, workspaceId: workspace.id } }
    );

    const result = await getAgentLoopRuntimeDataWithAuth(auth, {
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      throw new Error("expected model-not-found error");
    }
    expect(isAgentLoopDataModelNotFoundError(result.error)).toBe(true);
    expect(result.error.message).toBe(
      "The selected model was not found claude-smores-eap."
    );
  });
});
