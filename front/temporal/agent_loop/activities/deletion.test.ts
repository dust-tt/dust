import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { finalizeCancellation } from "@app/temporal/agent_loop/activities/common";
import { runModelAndCreateActionsActivity } from "@app/temporal/agent_loop/activities/run_model_and_create_actions_wrapper";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { assert, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@temporalio/activity")>()),
  Context: {
    current: () => ({ info: { attempt: 1, startToCloseTimeoutMs: 60_000 } }),
  },
  heartbeat: vi.fn(),
}));

async function createRunningLoop() {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfig.sId,
    messagesCreatedAt: [],
  });
  const { userMessage, messageRow } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig,
    parentMessageModelId: messageRow.id,
    rank: 1,
  });
  await ConversationResource.setIsRunningAgentLoop(auth, {
    conversation,
    isRunningAgentLoop: true,
  });
  const resource = await ConversationResource.fetchById(auth, conversation.sId);
  assert(resource);
  return {
    auth,
    workspace,
    agentConfig,
    conversation: resource,
    agentLoopArgs: {
      conversationId: conversation.sId,
      conversationTitle: conversation.title,
      agentMessageId: agentMessage.sId,
      agentMessageVersion: agentMessage.version,
      userMessageId: userMessage.sId,
      userMessageVersion: userMessage.version,
      userMessageOrigin: userMessage.context.origin,
    },
  };
}

describe("agent loop deletion cleanup", () => {
  it.each([
    "next step",
    "cancellation",
  ] as const)("finalizes the message when %s encounters a deleted conversation", async (exit) => {
    const { auth, conversation, agentLoopArgs } = await createRunningLoop();
    await conversation.updateVisibilityToDeleted(auth);

    if (exit === "next step") {
      expect(
        await runModelAndCreateActionsActivity({
          authType: auth.toJSON(),
          runAgentArgs: { ...agentLoopArgs, initialStartTime: Date.now() },
          runIds: [],
          step: 0,
        })
      ).toBeNull();
    } else {
      await finalizeCancellation(auth.toJSON(), agentLoopArgs);
    }

    const message = await conversation.getMessageById(
      auth,
      agentLoopArgs.agentMessageId
    );
    assert(message.isOk());
    expect(message.value.agentMessage?.status).toBe("cancelled");
    expect(message.value.agentMessage?.completedAt).toBeInstanceOf(Date);
    const updated = await ConversationResource.fetchById(
      auth,
      conversation.sId,
      {
        includeDeleted: true,
      }
    );
    expect(updated?.isRunningAgentLoop).toBe(false);
  });

  it("preserves another running message and ignores repeated cleanup", async () => {
    const { auth, workspace, agentConfig, conversation, agentLoopArgs } =
      await createRunningLoop();
    const { agentMessage: nextMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation,
        agentConfig,
        rank: 2,
      });
    await conversation.updateVisibilityToDeleted(auth);

    await finalizeCancellation(auth.toJSON(), agentLoopArgs);
    const first = await conversation.getMessageById(
      auth,
      agentLoopArgs.agentMessageId
    );
    assert(first.isOk());
    expect(first.value.agentMessage?.status).toBe("cancelled");
    const completedAt = first.value.agentMessage?.completedAt;

    await finalizeCancellation(auth.toJSON(), agentLoopArgs);
    const repeated = await conversation.getMessageById(
      auth,
      agentLoopArgs.agentMessageId
    );
    assert(repeated.isOk());
    expect(repeated.value.agentMessage?.completedAt).toEqual(completedAt);
    const updated = await ConversationResource.fetchById(
      auth,
      conversation.sId,
      {
        includeDeleted: true,
      }
    );
    expect(updated?.isRunningAgentLoop).toBe(true);
    expect((await conversation.getRunningAgentMessage(auth))?.sId).toBe(
      nextMessage.sId
    );
  });

  it("cannot cancel a message in another workspace", async () => {
    const { auth, conversation, agentLoopArgs } = await createRunningLoop();
    const { authenticator: otherAuth } = await createResourceTest({});
    await conversation.updateVisibilityToDeleted(auth);

    await ConversationResource.cancelUnavailableAgentMessage(
      otherAuth,
      agentLoopArgs
    );

    const message = await conversation.getMessageById(
      auth,
      agentLoopArgs.agentMessageId
    );
    assert(message.isOk());
    expect(message.value.agentMessage?.status).toBe("created");
  });
});
