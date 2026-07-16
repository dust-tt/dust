import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Redis hybrid manager (same as blocked_actions.test.ts) so cleanup paths don't hit Redis.
const { removeEventMock } = vi.hoisted(() => ({
  removeEventMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: removeEventMock,
  }),
}));

import { clearActionRequiredIfNoBlockedActions } from "@app/lib/api/assistant/conversation/blocked_actions";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";

/**
 * Repro for: triggered conversations with a blocking action (tool approval) never show up in
 * the inbox.
 *
 * Inbox condition (client-side, see
 * front/components/assistant/conversation/utils.ts filterTriggeredConversations /
 * getGroupConversationsByUnreadAndActionRequired): a triggered conversation is surfaced iff
 * `unread || actionRequired` on the list item returned by
 * GET /api/w/{wId}/assistant/conversations (listPrivateConversationsForUserPaginated).
 */
describe("triggered conversation with blocked action → inbox visibility", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();

    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Mimic the trigger flow (front/temporal/triggers/activities.ts):
    // createConversation + postUserMessage with the trigger owner's auth.
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    const trigger = await TriggerFactory.schedule(auth, {
      agentConfigurationId: "test-agent",
      configuration: {
        cron: "0 9 * * *",
        timezone: "UTC",
      },
    });
    await ConversationFactory.setTriggerIdForTest(
      conversation.id,
      workspace.id,
      trigger.id
    );

    // postUserMessage upserts participation with default lastReadAt = new Date(),
    // so the conversation starts "read" for the trigger owner.
    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });
  });

  async function getListItem() {
    const { conversations } =
      await ConversationResource.listPrivateConversationsForUserPaginated(
        auth,
        { limit: 100 }
      );
    return conversations.find((c) => c.sId === conversation.sId);
  }

  it("appears in inbox after a tool blocks on validation (run_tool path)", async () => {
    // Agent message stays status "created" with a blocked_validation_required action.
    await AgentMCPActionFactory.createWithAgentMessage(auth, {
      workspace,
      conversation,
    });

    // What run_tool.ts does when it sees tool_approve_execution:
    await ConversationResource.markAsActionRequired(auth, { conversation });

    const item = await getListItem();
    expect(item).toBeDefined();
    expect(item?.actionRequired).toBe(true);
    // Blocking bumps `updatedAt` past the owner's post-time `lastReadAt`.
    expect(item?.unread).toBe(true);
    // Inbox condition:
    expect(item!.unread || item!.actionRequired).toBe(true);
  });

  it("keeps actionRequired when the stale-flag cleanup runs (GET conversation path)", async () => {
    // Production-faithful linkage: agent message has a parent user message
    // (postUserMessage always sets parentId).
    const userMessageRow = await ConversationFactory.createUserMessageWithRank({
      auth,
      workspace,
      conversationId: conversation.id,
      rank: 0,
      content: "Trigger message",
    });
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Blocked Test Agent",
    });
    const agentMessageRow =
      await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank: 1,
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: agentConfig.version,
        parentId: userMessageRow.id,
      });
    await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessageRow.agentMessageId!,
    });
    await ConversationResource.markAsActionRequired(auth, { conversation });

    // GET /conversations/[cId] runs this to clear stale flags; it must NOT clear the flag
    // while a blocked action is still pending.
    await clearActionRequiredIfNoBlockedActions(auth, {
      conversationId: conversation.sId,
    });

    const item = await getListItem();
    expect(item?.actionRequired).toBe(true);
  });

  it("resurfaces to the top of the paginated list when a tool blocks", async () => {
    // The conversation was triggered a while ago and other conversations have
    // been updated since: pin its updatedAt in the past and add a newer one.
    await ConversationFactory.setUpdatedAtForTest(
      auth,
      conversation.id,
      new Date(Date.now() - 60 * 60 * 1000)
    );
    const newerConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
    await ConversationResource.upsertParticipation(auth, {
      conversation: newerConversation,
      action: "posted",
      user: auth.getNonNullableUser().toJSON(),
    });

    // Sidebar fetches pages of N most-recently-updated conversations. With a page
    // of 1 (stand-in for 100 in prod), the triggered conversation is not in the
    // page while it runs.
    const { conversations: beforeBlock } =
      await ConversationResource.listPrivateConversationsForUserPaginated(
        auth,
        { limit: 1 }
      );
    expect(beforeBlock.map((c) => c.sId)).not.toContain(conversation.sId);

    // A tool blocks on validation: like the completed-run path, this must bump
    // updatedAt so the conversation re-enters the fetched window and the inbox.
    await AgentMCPActionFactory.createWithAgentMessage(auth, {
      workspace,
      conversation,
    });
    await ConversationResource.markAsActionRequired(auth, { conversation });

    const { conversations: afterBlock } =
      await ConversationResource.listPrivateConversationsForUserPaginated(
        auth,
        { limit: 1 }
      );
    expect(afterBlock.map((c) => c.sId)).toContain(conversation.sId);
    expect(afterBlock[0].unread).toBe(true);
    expect(afterBlock[0].actionRequired).toBe(true);
  });
});
