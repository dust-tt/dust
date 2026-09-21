import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockLaunchAgentLoopWorkflow } = vi.hoisted(() => ({
  mockLaunchAgentLoopWorkflow: vi.fn(),
}));

vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: mockLaunchAgentLoopWorkflow,
}));

import {
  continueCreditSpendCheckpointPause,
  declineCreditSpendCheckpointPause,
} from "@app/lib/api/assistant/conversation/credit_spend_checkpoint_pause";
import { Authenticator } from "@app/lib/auth";
import { AgentStepContentResource } from "@app/lib/resources/agent_step_content_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";

describe("credit spend checkpoint pause resolution", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationResource;
  let agentMessageId: string;
  let agentMessageModelId: ModelId;

  const getStatus = () =>
    ConversationResource.fetchAgentMessageCreditSpendCheckpointStatus(auth, {
      agentMessageId,
    });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLaunchAgentLoopWorkflow.mockResolvedValue(new Ok(undefined));

    const setup = await createResourceTest({ role: "admin" });
    workspace = setup.workspace;
    auth = setup.authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const created = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    await ConversationResource.upsertParticipation(auth, {
      conversation: created,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    const { messageRow: userMessageRow } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: created,
        content: "Do a long task",
      });
    const { messageRow: agentMessageRow, agentMessage } =
      await ConversationFactory.createAgentMessage(auth, {
        workspace,
        conversation: created,
        agentConfig,
        parentMessageModelId: userMessageRow.id,
        rank: 1,
      });
    agentMessageId = agentMessageRow.sId;
    agentMessageModelId = agentMessage.agentMessageId;

    // The loop paused after completing step 2.
    for (const step of [0, 1, 2]) {
      await AgentStepContentResource.createNewVersion({
        workspaceId: workspace.id,
        agentMessageId: agentMessageModelId,
        step,
        index: 0,
        type: "text_content",
        value: { type: "text_content", value: `step ${step}` },
      });
    }
    await ConversationResource.markAgentMessageCreditSpendCheckpointPaused(
      auth,
      { agentMessage }
    );

    const fetched = await ConversationResource.fetchById(auth, created.sId);
    if (!fetched) {
      throw new Error("conversation not found");
    }
    conversation = fetched;
  });

  it("rejects a message that is not paused", async () => {
    await ConversationResource.transitionAgentMessageCreditSpendCheckpointStatus(
      auth,
      { agentMessageModelId, from: "paused", to: null }
    );

    const res = await continueCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toMatchObject({ code: "agent_message_not_resumable" });
    }
    expect(mockLaunchAgentLoopWorkflow).not.toHaveBeenCalled();
  });

  it("rejects a user other than the one who posted the parent message", async () => {
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, otherUser, { role: "user" });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const res = await declineCreditSpendCheckpointPause(
      otherAuth,
      conversation,
      { messageId: agentMessageId }
    );

    expect(res.isErr()).toBe(true);
    if (res.isErr()) {
      expect(res.error).toMatchObject({ code: "unauthorized" });
    }
    expect(await getStatus()).toBe("paused");
  });

  it("continue acknowledges the pause and relaunches the loop at the next step", async () => {
    const res = await continueCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });

    expect(res.isOk()).toBe(true);
    expect(await getStatus()).toBe("acknowledged");
    expect(mockLaunchAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(mockLaunchAgentLoopWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        startStep: 3,
        waitForCompletion: true,
        agentLoopArgs: expect.objectContaining({
          agentMessageId,
          conversationId: conversation.sId,
        }),
      })
    );
  });

  it("resolving the same pause twice is a no-op the second time", async () => {
    await continueCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });
    const second = await declineCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });

    expect(second.isErr()).toBe(true);
    expect(mockLaunchAgentLoopWorkflow).toHaveBeenCalledTimes(1);
    expect(await getStatus()).toBe("acknowledged");
  });

  it("continue puts the message back to paused when the launch fails", async () => {
    mockLaunchAgentLoopWorkflow.mockResolvedValue(
      new Err(new Error("temporal unavailable"))
    );

    const res = await continueCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });

    expect(res.isErr()).toBe(true);
    expect(await getStatus()).toBe("paused");
  });

  it("decline stops the pause and cancels the message without relaunching the loop", async () => {
    const res = await declineCreditSpendCheckpointPause(auth, conversation, {
      messageId: agentMessageId,
    });

    expect(res.isOk()).toBe(true);
    expect(await getStatus()).toBe("stopped");
    expect(mockLaunchAgentLoopWorkflow).not.toHaveBeenCalled();

    const messageRes = await ConversationResource.getMessageByIdInConversation(
      auth,
      conversation.toJSON(),
      agentMessageId
    );
    if (messageRes.isErr()) {
      throw messageRes.error;
    }
    expect(messageRes.value.agentMessage?.status).toBe("cancelled");

    const { actionRequired } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth,
        conversation.id
      );
    expect(actionRequired).toBe(false);
  });
});
