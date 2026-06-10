import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis hybrid manager to prevent it from removing events
const { removeEventMock } = vi.hoisted(() => ({
  removeEventMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: removeEventMock,
  }),
}));

import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import {
  clearActionRequiredIfNoBlockedActions,
  resolveBlockedActionsForTerminatedMessage,
} from "@app/lib/api/assistant/conversation/blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

describe("blocked actions resolution", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });

    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });
  });

  async function createAgentMessageAtRank(rank: number) {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: `Test Agent ${rank}`,
    });

    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: rank - 1,
      content: "Test message",
    });

    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank,
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      parentId: userMessageRow.id,
    });

    return { messageRow, agentMessageRowId: messageRow.agentMessageId! };
  }

  async function getActionRequired() {
    const { actionRequired } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth,
        conversation.id
      );
    return actionRequired;
  }

  describe("resolveBlockedActionsForTerminatedMessage", () => {
    it("denies blocked actions and clears actionRequired when none remain", async () => {
      const { messageRow, agentMessageRowId } =
        await createAgentMessageAtRank(1);
      const { action } = await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await resolveBlockedActionsForTerminatedMessage(auth, {
        conversation,
        agentMessage: {
          agentMessageId: agentMessageRowId,
          sId: messageRow.sId,
        },
      });

      await action.reload();
      expect(action.status).toBe("denied");

      // The pending approval event was removed from the message channel.
      expect(removeEventMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringContaining(messageRow.sId)
      );

      expect(await getActionRequired()).toBe(false);
    });

    it("keeps actionRequired when another message still has a blocked action", async () => {
      const { messageRow, agentMessageRowId } =
        await createAgentMessageAtRank(1);
      const { action } = await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessageRowId,
      });

      const { agentMessageRowId: otherAgentMessageRowId } =
        await createAgentMessageAtRank(3);
      const { action: otherAction } = await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: otherAgentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await resolveBlockedActionsForTerminatedMessage(auth, {
        conversation,
        agentMessage: {
          agentMessageId: agentMessageRowId,
          sId: messageRow.sId,
        },
      });

      await action.reload();
      expect(action.status).toBe("denied");

      // The other message's blocked action is untouched and keeps the flag up.
      await otherAction.reload();
      expect(otherAction.status).toBe("blocked_validation_required");
      expect(await getActionRequired()).toBe(true);
    });

    it("is a no-op when the message has no blocked action", async () => {
      const { messageRow, agentMessageRowId } =
        await createAgentMessageAtRank(1);

      await resolveBlockedActionsForTerminatedMessage(auth, {
        conversation,
        agentMessage: {
          agentMessageId: agentMessageRowId,
          sId: messageRow.sId,
        },
      });

      expect(removeEventMock).not.toHaveBeenCalled();
    });
  });

  describe("clearActionRequiredIfNoBlockedActions", () => {
    it("clears the flag when the only blocked action belongs to an unresumable message", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessageRowId,
      });

      // Simulate a legacy stuck conversation: the message was interrupted while its blocked
      // action was left pending.
      await AgentMessageModel.update(
        { status: "interrupted" },
        { where: { id: agentMessageRowId, workspaceId: workspace.id } }
      );

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(false);
    });

    it("does not clear the flag when an actionable blocked action remains", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(true);
    });
  });

  describe("updateAgentMessageWithFinalStatus", () => {
    it("resolves blocked actions when the message is interrupted", async () => {
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        { workspace, conversation, agentConfig }
      );
      const { action } = await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessage.agentMessageId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      await action.reload();
      expect(action.status).toBe("denied");
      expect(await getActionRequired()).toBe(false);
    });

    it("leaves blocked actions untouched when the message is gracefully stopped", async () => {
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        { workspace, conversation, agentConfig }
      );
      const { action } = await AgentMCPActionFactory.create({
        workspace,
        conversationId: conversation.id,
        agentMessageId: agentMessage.agentMessageId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "gracefully_stopped",
      });

      // A graceful stop keeps pending approvals actionable.
      await action.reload();
      expect(action.status).toBe("blocked_validation_required");
      expect(await getActionRequired()).toBe(true);
    });
  });
});
