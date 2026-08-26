import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function dateFromDaysAgo(daysAgo: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
}

describe("GET /api/poke/workspaces/:wId/conversations", () => {
  it("pages the agent conversations, newest first", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const otherAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Other Test Agent",
    });

    const oldestConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(10)],
      conversationCreatedAt: dateFromDaysAgo(10),
    });
    const middleConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(5)],
      conversationCreatedAt: dateFromDaysAgo(5),
    });
    const newestConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(1)],
      conversationCreatedAt: dateFromDaysAgo(1),
    });
    const otherAgentConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: otherAgent.sId,
      messagesCreatedAt: [dateFromDaysAgo(1)],
      conversationCreatedAt: dateFromDaysAgo(1),
    });

    const url = `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}`;

    const firstResponse = await honoApp.request(`${url}&limit=2`);
    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(firstPage.conversations.map((c: { sId: string }) => c.sId)).toEqual([
      newestConversation.sId,
      middleConversation.sId,
    ]);
    expect(firstPage.hasMore).toBe(true);

    const secondResponse = await honoApp.request(`${url}&limit=3`);
    expect(secondResponse.status).toBe(200);
    const secondPage = await secondResponse.json();
    expect(secondPage.conversations.map((c: { sId: string }) => c.sId)).toEqual(
      [newestConversation.sId, middleConversation.sId, oldestConversation.sId]
    );
    expect(secondPage.hasMore).toBe(false);
    expect(
      secondPage.conversations.map((c: { sId: string }) => c.sId)
    ).not.toContain(otherAgentConversation.sId);
  });

  it("defaults the limit when none is provided", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(1)],
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversations).toEqual([
      expect.objectContaining({ sId: conversation.sId }),
    ]);
    expect(body.hasMore).toBe(false);
  });

  it("rejects a request with no agent, trigger or reinforced skill", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations`
    );

    expect(response.status).toBe(400);
  });
});
