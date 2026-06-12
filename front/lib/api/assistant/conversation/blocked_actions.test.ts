import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis hybrid manager to prevent it from removing events
const { emitAuditLogEventDirectMock, removeEventMock } = vi.hoisted(() => ({
  emitAuditLogEventDirectMock: vi.fn().mockResolvedValue(undefined),
  removeEventMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: removeEventMock,
  }),
}));

vi.mock("@app/lib/api/audit/workos_audit", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/audit/workos_audit")>();
  return {
    ...actual,
    emitAuditLogEventDirect: emitAuditLogEventDirectMock,
  };
});

import { updateAgentMessageWithFinalStatus } from "@app/lib/api/assistant/conversation";
import {
  cleanupDeniedBlockedActions,
  clearActionRequiredIfNoBlockedActions,
} from "@app/lib/api/assistant/conversation/blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
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

  describe("cleanupDeniedBlockedActions", () => {
    it("denies blocked actions and clears actionRequired when none remain", async () => {
      const { messageRow, agentMessage, action } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      const reloadedAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId
      );
      expect(reloadedAction?.status).toBe("denied");

      await vi.waitFor(() =>
        expect(emitAuditLogEventDirectMock).toHaveBeenCalledWith(
          expect.objectContaining({
            action: "tool.approval_resolved",
            actor: {
              type: "system",
              id: "agent-message-termination",
              name: "Agent message termination",
            },
            context: { location: "internal" },
            metadata: expect.objectContaining({
              action_id: action.sId,
              decision: "auto_rejected",
              deciding_user_email: "system",
              deciding_user_id: "system",
            }),
          })
        )
      );

      // The pending approval event was removed from the message channel.
      expect(removeEventMock).toHaveBeenCalledWith(
        expect.any(Function),
        expect.stringContaining(messageRow.sId)
      );

      expect(await getActionRequired()).toBe(false);
    });

    it("keeps actionRequired when another message still has a blocked action", async () => {
      const { agentMessage, action } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });

      const { agentMessageRowId: otherAgentMessageRowId } =
        await createAgentMessageAtRank(3);
      const { action: otherAction } = await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: otherAgentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      const reloadedAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId
      );
      expect(reloadedAction?.status).toBe("denied");

      // The other message's blocked action is untouched and keeps the flag up.
      const reloadedOtherAction = await AgentMCPActionResource.fetchById(
        auth,
        otherAction.sId
      );
      expect(reloadedOtherAction?.status).toBe("blocked_validation_required");
      expect(await getActionRequired()).toBe(true);
    });

    it("still clears a stale actionRequired flag when no blocked action remains", async () => {
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        { workspace, conversation, agentConfig }
      );

      // Simulate a partial previous run: blocked actions already denied, but the run failed
      // before clearing the flag. A retry must converge.
      await ConversationResource.markAsActionRequired(auth, { conversation });

      await cleanupDeniedBlockedActions(auth, {
        conversation,
        agentMessage,
        deniedActions: [],
      });

      expect(removeEventMock).not.toHaveBeenCalled();
      expect(await getActionRequired()).toBe(false);
    });

    it("denies non-approval blocked actions and purges all blocked-action events", async () => {
      const { messageRow, agentMessage, action } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
          status: "blocked_authentication_required",
        });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      const reloadedAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId
      );
      expect(reloadedAction?.status).toBe("denied");

      // The removal predicate matches every blocked-action event type of the denied action,
      // not only approval events.
      const [predicate, channel] = removeEventMock.mock.calls[0];
      expect(channel).toContain(messageRow.sId);

      const actionId = action.sId;
      const makeEvent = (type: string, eventActionId: string) => ({
        message: {
          payload: JSON.stringify({ type, actionId: eventActionId }),
        },
      });
      expect(
        predicate(makeEvent("tool_personal_auth_required", actionId))
      ).toBe(true);
      expect(predicate(makeEvent("tool_ask_user_question", actionId))).toBe(
        true
      );
      expect(predicate(makeEvent("tool_approve_execution", actionId))).toBe(
        true
      );
      expect(
        predicate(makeEvent("tool_approve_execution", "other_action_id"))
      ).toBe(false);
      expect(emitAuditLogEventDirectMock).not.toHaveBeenCalled();
    });

    it("emits approval audit events only for actions actually denied", async () => {
      const { agentMessage, action: deniedAction } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });
      const { action: alreadyResolvedAction } =
        await AgentMCPActionFactory.create(auth, {
          workspace,
          conversationModelId: conversation.id,
          agentMessageModelId: agentMessage.agentMessageId,
        });
      await alreadyResolvedAction.updateStatus("ready_allowed_explicitly");

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      await vi.waitFor(() =>
        expect(emitAuditLogEventDirectMock).toHaveBeenCalledTimes(1)
      );

      expect(emitAuditLogEventDirectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action_id: deniedAction.sId,
          }),
        })
      );
      expect(emitAuditLogEventDirectMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            action_id: alreadyResolvedAction.sId,
          }),
        })
      );
    });

    it("commits the deny with the terminal status update", async () => {
      const { agentMessage } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      await expect(
        AgentMCPActionResource.listBlockedActionsForAgentMessage(auth, {
          agentMessageId: agentMessage.agentMessageId,
        })
      ).resolves.toEqual([]);
    });
  });

  describe("clearActionRequiredIfNoBlockedActions", () => {
    it("clears the flag when the only blocked action belongs to an unresumable message", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessageRowId,
      });

      // Simulate a legacy stuck conversation: the message was interrupted while its blocked
      // action was left pending.
      await ConversationFactory.setAgentMessageStatus({
        workspace,
        agentMessageModelId: agentMessageRowId,
        status: "interrupted",
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });
      expect(await getActionRequired()).toBe(true);

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(false);
    });

    it("does not clear the flag when an actionable blocked action remains", async () => {
      const { agentMessageRowId } = await createAgentMessageAtRank(1);
      await AgentMCPActionFactory.create(auth, {
        workspace,
        conversationModelId: conversation.id,
        agentMessageModelId: agentMessageRowId,
      });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await clearActionRequiredIfNoBlockedActions(auth, {
        conversationId: conversation.sId,
      });

      expect(await getActionRequired()).toBe(true);
    });
  });

  describe("updateAgentMessageWithFinalStatus", () => {
    it("denies blocked actions when the message is interrupted", async () => {
      const { agentMessage, action } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "interrupted",
      });

      const reloadedAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId
      );
      expect(reloadedAction?.status).toBe("denied");
      expect(await getActionRequired()).toBe(false);
    });

    it("leaves blocked actions untouched when the message is gracefully stopped", async () => {
      const { agentMessage, action } =
        await AgentMCPActionFactory.createWithAgentMessage(auth, {
          workspace,
          conversation,
        });

      await ConversationResource.markAsActionRequired(auth, { conversation });

      await updateAgentMessageWithFinalStatus(auth, {
        conversation,
        agentMessage,
        status: "gracefully_stopped",
      });

      // A graceful stop keeps pending approvals actionable.
      const reloadedAction = await AgentMCPActionResource.fetchById(
        auth,
        action.sId
      );
      expect(reloadedAction?.status).toBe("blocked_validation_required");
      expect(await getActionRequired()).toBe(true);
    });
  });
});
