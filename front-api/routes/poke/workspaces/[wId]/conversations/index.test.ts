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

function sIds(conversations: { sId: string }[]): string[] {
  return conversations.map((conversation) => conversation.sId);
}

describe("GET /api/poke/workspaces/:wId/conversations", () => {
  it("pages the agent conversations by offset, newest first", async () => {
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

    const firstResponse = await honoApp.request(`${url}&limit=2&offset=0`);
    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(sIds(firstPage.conversations)).toEqual([
      newestConversation.sId,
      middleConversation.sId,
    ]);
    // The count spans the whole matching set, not the page.
    expect(firstPage.totalCount).toBe(3);

    const secondResponse = await honoApp.request(`${url}&limit=2&offset=2`);
    expect(secondResponse.status).toBe(200);
    const secondPage = await secondResponse.json();
    expect(sIds(secondPage.conversations)).toEqual([oldestConversation.sId]);
    expect(secondPage.totalCount).toBe(3);

    expect([
      ...sIds(firstPage.conversations),
      ...sIds(secondPage.conversations),
    ]).not.toContain(otherAgentConversation.sId);
  });

  it("returns an empty page past the end", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(1)],
    });

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}&limit=25&offset=100`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.conversations).toEqual([]);
  });

  it("orders the agent conversations by the requested column", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const oldest = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(10)],
      conversationCreatedAt: dateFromDaysAgo(10),
    });
    const newest = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [dateFromDaysAgo(1)],
      conversationCreatedAt: dateFromDaysAgo(1),
    });

    const url = `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}`;

    const ascendingResponse = await honoApp.request(
      `${url}&orderColumn=createdAt&orderDirection=asc`
    );
    expect(ascendingResponse.status).toBe(200);
    expect(sIds((await ascendingResponse.json()).conversations)).toEqual([
      oldest.sId,
      newest.sId,
    ]);

    const descendingResponse = await honoApp.request(
      `${url}&orderColumn=createdAt&orderDirection=desc`
    );
    expect(descendingResponse.status).toBe(200);
    expect(sIds((await descendingResponse.json()).conversations)).toEqual([
      newest.sId,
      oldest.sId,
    ]);
  });

  it("rejects an unknown order column", async () => {
    const { auth, workspace } = await createPrivateApiMockRequest({
      isSuperUser: true,
      role: "admin",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await honoApp.request(
      `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}&orderColumn=hasError`
    );

    expect(response.status).toBe(400);
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
    expect(sIds(range.conversations)).toEqual([februaryConversation.sId]);
    // The count follows the window, so the page count does too.
    expect(range.totalCount).toBe(1);

    const fromOnlyResponse = await honoApp.request(`${url}&from=2026-02-01`);
    expect(fromOnlyResponse.status).toBe(200);
    expect(sIds((await fromOnlyResponse.json()).conversations)).toEqual([
      marchConversation.sId,
      februaryConversation.sId,
    ]);

    const toOnlyResponse = await honoApp.request(`${url}&to=2026-02-20`);
    expect(toOnlyResponse.status).toBe(200);
    // `to` is inclusive, so the conversation created during that day is kept.
    expect(sIds((await toOnlyResponse.json()).conversations)).toEqual([
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

    const olderInWindow = await ConversationFactory.create(auth, {
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

    const url = `/api/poke/workspaces/${workspace.sId}/conversations?agentId=${agent.sId}&from=2026-01-01&to=2026-01-31&limit=1`;

    const firstResponse = await honoApp.request(`${url}&offset=0`);
    expect(firstResponse.status).toBe(200);
    const firstPage = await firstResponse.json();
    expect(sIds(firstPage.conversations)).toEqual([newerInWindow.sId]);
    expect(firstPage.totalCount).toBe(2);

    const secondResponse = await honoApp.request(`${url}&offset=1`);
    expect(secondResponse.status).toBe(200);
    expect(sIds((await secondResponse.json()).conversations)).toEqual([
      olderInWindow.sId,
    ]);
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

  it("defaults the paging and ordering when none is provided", async () => {
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
    expect(sIds(body.conversations)).toEqual([conversation.sId]);
    expect(body.totalCount).toBe(1);
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
