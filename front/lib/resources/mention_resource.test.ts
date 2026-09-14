import { ONE_DAY_MS } from "@app/lib/api/assistant/inactivity/policy";
import type { Authenticator } from "@app/lib/auth";
import { MentionResource } from "@app/lib/resources/mention_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MentionFactory } from "@app/tests/utils/MentionFactory";
import { describe, expect, it } from "vitest";

async function createMessage(
  auth: Authenticator,
  agentConfigurationId: string
) {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [],
  });
  const { messageRow } = await ConversationFactory.createUserMessage({
    auth,
    workspace: auth.getNonNullableWorkspace(),
    conversation,
    content: "@agent hello",
  });

  return messageRow;
}

describe("MentionResource", () => {
  describe("makeNew", () => {
    it("creates a mention row with the given attributes", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");

      const mention = await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      expect(mention.id).toBeTypeOf("number");
      expect(mention.messageId).toBe(message.id);
      expect(mention.userId).toBe(user.id);
      expect(mention.agentConfigurationId).toBeNull();
      expect(mention.status).toBe("approved");
      expect(mention.dismissed).toBe(false);
    });
  });

  describe("findByMessagesAndUser", () => {
    it("finds the user's mention across the given messages, optionally narrowed by status", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");
      const otherMessage = await createMessage(authenticator, "test-agent");

      await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "pending_conversation_access",
      });

      const found = await MentionResource.findByMessagesAndUser(authenticator, {
        messageModelIds: [otherMessage.id, message.id],
        userModelId: user.id,
      });
      expect(found?.messageId).toBe(message.id);

      const narrowedOut = await MentionResource.findByMessagesAndUser(
        authenticator,
        {
          messageModelIds: [message.id],
          userModelId: user.id,
          status: "approved",
        }
      );
      expect(narrowedOut).toBeNull();

      const noMatch = await MentionResource.findByMessagesAndUser(
        authenticator,
        { messageModelIds: [otherMessage.id], userModelId: user.id }
      );
      expect(noMatch).toBeNull();
    });
  });

  describe("listByMessageModelIds", () => {
    it("lists the mentions of the given messages, optionally narrowed by user, agent, or status", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "agent-a");
      const otherMessage = await createMessage(authenticator, "agent-a");

      const userMention = await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });
      const agentMention = await MentionResource.makeNew({
        messageId: message.id,
        agentConfigurationId: "agent-a",
        workspaceId: workspace.id,
        status: "agent_restricted_by_space_usage",
      });
      await MentionResource.makeNew({
        messageId: otherMessage.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      const allForMessage = await MentionResource.listByMessageModelIds(
        authenticator,
        { messageModelIds: [message.id] }
      );
      expect(allForMessage.map((m) => m.id).sort()).toEqual(
        [userMention.id, agentMention.id].sort()
      );

      const byAgent = await MentionResource.listByMessageModelIds(
        authenticator,
        { messageModelIds: [message.id], agentConfigurationId: "agent-a" }
      );
      expect(byAgent.map((m) => m.id)).toEqual([agentMention.id]);

      const byStatus = await MentionResource.listByMessageModelIds(
        authenticator,
        {
          messageModelIds: [message.id],
          status: "agent_restricted_by_space_usage",
        }
      );
      expect(byStatus.map((m) => m.id)).toEqual([agentMention.id]);

      expect(
        await MentionResource.listByMessageModelIds(authenticator, {
          messageModelIds: [],
        })
      ).toEqual([]);
    });
  });

  describe("listAgentsNotMentionedSince", () => {
    it("returns active agents whose last mention predates the cutoff", async () => {
      const { authenticator } = await createResourceTest({});
      const cutoffAt = new Date("2026-07-19T00:00:00.000Z");

      const staleAgent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Stale agent" }
      );
      await AgentConfigurationFactory.backdate(
        authenticator,
        staleAgent.sId,
        new Date(cutoffAt.getTime() - 10 * ONE_DAY_MS)
      );
      await MentionFactory.agentMentionedAt(authenticator, {
        agentId: staleAgent.sId,
        mentionedAt: new Date(cutoffAt.getTime() - 5 * ONE_DAY_MS),
      });

      const activeAgent = await AgentConfigurationFactory.createTestAgent(
        authenticator,
        { name: "Recently used agent" }
      );
      await AgentConfigurationFactory.backdate(
        authenticator,
        activeAgent.sId,
        new Date(cutoffAt.getTime() - 10 * ONE_DAY_MS)
      );
      await MentionFactory.agentMentionedAt(authenticator, {
        agentId: activeAgent.sId,
        mentionedAt: new Date(cutoffAt.getTime() + 1 * ONE_DAY_MS),
      });

      const idle = await MentionResource.listAgentsNotMentionedSince(
        authenticator,
        { notMentionedSince: cutoffAt }
      );

      expect(idle.map((a) => a.agentId)).toContain(staleAgent.sId);
      expect(idle.map((a) => a.agentId)).not.toContain(activeAgent.sId);
    });
  });

  describe("updateStatus", () => {
    it("moves the mention to the new status, live and in the database", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");

      const mention = await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "pending_conversation_access",
      });

      await mention.updateStatus(authenticator, { status: "approved" });
      expect(mention.status).toBe("approved");

      const refetched = await MentionResource.findByMessagesAndUser(
        authenticator,
        { messageModelIds: [message.id], userModelId: user.id }
      );
      expect(refetched?.status).toBe("approved");
    });
  });

  describe("dismiss", () => {
    it("marks the mention dismissed, live and in the database", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");

      const mention = await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "user_restricted_by_conversation_access",
      });

      await mention.dismiss(authenticator);
      expect(mention.dismissed).toBe(true);

      const refetched = await MentionResource.findByMessagesAndUser(
        authenticator,
        { messageModelIds: [message.id], userModelId: user.id }
      );
      expect(refetched?.dismissed).toBe(true);
    });
  });

  describe("deleteByMessageModelIds", () => {
    it("deletes every mention of the given messages, leaving others untouched", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");
      const otherMessage = await createMessage(authenticator, "test-agent");

      await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });
      await MentionResource.makeNew({
        messageId: otherMessage.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      const deletedCount = await MentionResource.deleteByMessageModelIds(
        authenticator,
        { messageModelIds: [message.id] }
      );
      expect(deletedCount).toBe(1);

      expect(
        await MentionResource.listByMessageModelIds(authenticator, {
          messageModelIds: [message.id],
        })
      ).toEqual([]);
      expect(
        await MentionResource.listByMessageModelIds(authenticator, {
          messageModelIds: [otherMessage.id],
        })
      ).toHaveLength(1);
    });
  });

  describe("delete", () => {
    it("deletes this mention only", async () => {
      const { authenticator, workspace, user } = await createResourceTest({});
      const message = await createMessage(authenticator, "test-agent");
      const otherMessage = await createMessage(authenticator, "test-agent");

      const mention = await MentionResource.makeNew({
        messageId: message.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });
      await MentionResource.makeNew({
        messageId: otherMessage.id,
        userId: user.id,
        workspaceId: workspace.id,
        status: "approved",
      });

      const result = await mention.delete(authenticator);
      expect(result.isOk()).toBe(true);
      expect(result.isOk() && result.value).toBe(1);

      expect(
        await MentionResource.listByMessageModelIds(authenticator, {
          messageModelIds: [message.id],
        })
      ).toEqual([]);
    });
  });
});
