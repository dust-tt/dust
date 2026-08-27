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

  it("restricts the agent conversations to the created-at window", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const januaryConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-01-15T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-01-15T12:00:00.000Z"),
    });
    const februaryConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-02-20T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-02-20T12:00:00.000Z"),
    });
    const marchConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-03-10T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-03-10T12:00:00.000Z"),
    });

    const url = `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}`;

    const rangeResponse = await honoApp.request(
      `${url}&from=2026-02-01&to=2026-02-28`
    );
    expect(rangeResponse.status).toBe(200);
    const range = await rangeResponse.json();
    expect(range.conversations.map((c: { sId: string }) => c.sId)).toEqual([
      februaryConversation.sId,
    ]);

    const fromOnlyResponse = await honoApp.request(`${url}&from=2026-02-01`);
    expect(fromOnlyResponse.status).toBe(200);
    const fromOnly = await fromOnlyResponse.json();
    expect(fromOnly.conversations.map((c: { sId: string }) => c.sId)).toEqual([
      marchConversation.sId,
      februaryConversation.sId,
    ]);

    const toOnlyResponse = await honoApp.request(`${url}&to=2026-02-20`);
    expect(toOnlyResponse.status).toBe(200);
    const toOnly = await toOnlyResponse.json();
    // `to` is inclusive, so the conversation created during that day is kept.
    expect(toOnly.conversations.map((c: { sId: string }) => c.sId)).toEqual([
      februaryConversation.sId,
      januaryConversation.sId,
    ]);
  });

  it("pages within the created-at window", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-01-10T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-01-10T12:00:00.000Z"),
    });
    const newerInWindow = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-01-20T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-01-20T12:00:00.000Z"),
    });
    // Outside the window, and newer than everything in it.
    await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-05-01T12:00:00.000Z")],
      conversationCreatedAt: new Date("2026-05-01T12:00:00.000Z"),
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}&from=2026-01-01&to=2026-01-31&limit=1`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversations.map((c: { sId: string }) => c.sId)).toEqual([
      newerInWindow.sId,
    ]);
    expect(body.hasMore).toBe(true);
  });

  it("rejects a malformed date bound", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}&from=not-a-date`
    );

    expect(response.status).toBe(400);
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
