import type { Transaction } from "sequelize";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { LightWorkspaceType } from "@app/types/user";

vi.mock(import("../../../lib/api/redis"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    runOnRedis: vi.fn().mockImplementation((_, fn) =>
      fn({
        zAdd: vi.fn().mockResolvedValue(undefined),
        expire: vi.fn().mockResolvedValue(undefined),
      })
    ),
  };
});

const setupTestAgents = async (
  workspace: LightWorkspaceType,
  user: UserResource,
  t?: Transaction
) => {
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const agents = await Promise.all([
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent 1 ${user.name}`,
      description: "Hidden test agent",
      scope: "hidden",
    }),
    AgentConfigurationFactory.createTestAgent(auth, t, {
      name: `Test Agent 2 ${user.name}`,
      description: "Visible test agent",
      scope: "visible",
    }),
  ]);

  return agents;
};

const dateFromDaysAgo = (days: number) => {
  return new Date(new Date().getTime() - days * 24 * 60 * 60 * 1000);
};

describe("ConversationResource", () => {
  describe("listAllBeforeDate", () => {
    let auth: Authenticator;
    let convo1Id: string;
    let convo2Id: string;
    let convo3Id: string;
    let convo4Id: string;

    let anotherAuth: Authenticator;
    let anotherConvoId: string;

    beforeEach(async () => {
      const workspace = await WorkspaceFactory.basic();
      const user = await UserFactory.basic();
      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );
      const agents = await setupTestAgents(workspace, user);

      const convo1 = await ConversationFactory.create({
        auth,
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(10), dateFromDaysAgo(8)],
      });
      const convo2 = await ConversationFactory.create({
        auth,
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(100), dateFromDaysAgo(1)],
      });
      const convo3 = await ConversationFactory.create({
        auth,
        agentConfigurationId: agents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(100), dateFromDaysAgo(91)],
      });
      const convo4 = await ConversationFactory.create({
        auth,
        agentConfigurationId: agents[1].sId,
        messagesCreatedAt: [dateFromDaysAgo(150), dateFromDaysAgo(110)],
      });

      convo1Id = convo1.sId;
      convo2Id = convo2.sId;
      convo3Id = convo3.sId;
      convo4Id = convo4.sId;

      // Just to make sure we have the filter on workspaceId we also create a very very old convo for another workspace.
      const anotherWorkspace = await WorkspaceFactory.basic();
      const anotherUser = await UserFactory.basic();
      anotherAuth = await Authenticator.fromUserIdAndWorkspaceId(
        anotherUser.sId,
        anotherWorkspace.sId
      );
      const anotherAgents = await setupTestAgents(
        anotherWorkspace,
        anotherUser
      );
      const anotherConvo = await ConversationFactory.create({
        auth: anotherAuth,
        agentConfigurationId: anotherAgents[0].sId,
        messagesCreatedAt: [dateFromDaysAgo(800)],
      });
      anotherConvoId = anotherConvo.sId;
    });

    afterEach(async () => {
      await destroyConversation(auth, {
        conversationId: convo1Id,
      });
      await destroyConversation(auth, {
        conversationId: convo2Id,
      });
      await destroyConversation(auth, {
        conversationId: convo3Id,
      });
      await destroyConversation(auth, {
        conversationId: convo4Id,
      });
      await destroyConversation(anotherAuth, {
        conversationId: anotherConvoId,
      });
    });

    it("should return only conversations with all messages before cutoff date: 90 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        dateFromDaysAgo(90)
      );
      expect(oldConversations.length).toBe(2);
      const oldConversationIds = oldConversations.map((c) => c.sId);
      expect(oldConversationIds).toContain(convo3Id);
      expect(oldConversationIds).toContain(convo4Id);
    });

    it("should return only conversations with all messages before cutoff date: 200 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        dateFromDaysAgo(200)
      );
      expect(oldConversations.length).toBe(0);
    });

    it("should return only conversations with all messages before cutoff date: 5 days ago", async () => {
      const oldConversations = await ConversationResource.listAllBeforeDate(
        auth,
        dateFromDaysAgo(5)
      );
      expect(oldConversations.length).toBe(3);
      const oldConversationIds = oldConversations.map((c) => c.sId);
      expect(oldConversationIds).toContain(convo1Id);
      expect(oldConversationIds).toContain(convo3Id);
      expect(oldConversationIds).toContain(convo4Id);
    });
  });
});
