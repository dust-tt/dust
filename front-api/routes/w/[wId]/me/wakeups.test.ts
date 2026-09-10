import { Authenticator } from "@app/lib/auth";
import * as wakeUpClient from "@app/temporal/triggers/wakeup_client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WakeUpFactory } from "@app/tests/utils/WakeUpFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

function getUserWakeUps(workspaceId: string, query = "") {
  return honoApp.request(`/api/w/${workspaceId}/me/wakeups${query}`);
}

describe("GET /api/w/:wId/me/wakeups", () => {
  beforeEach(() => {
    vi.spyOn(
      wakeUpClient,
      "launchOrScheduleWakeUpTemporalWorkflow"
    ).mockResolvedValue(new Ok(undefined));
    vi.spyOn(wakeUpClient, "cancelWakeUpTemporalWorkflow").mockResolvedValue(
      new Ok(undefined)
    );
  });

  it("returns the caller's wake-ups with their conversation", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    const wakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration,
      { cronExpression: "0 7 * * *", reason: "daily digest" }
    );

    const response = await getUserWakeUps(workspace.sId);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalCount).toBe(1);
    expect(data.wakeUps).toHaveLength(1);
    expect(data.wakeUps[0].wakeUp).toMatchObject({
      sId: wakeUp.sId,
      reason: "daily digest",
      status: "scheduled",
      scheduleConfig: {
        type: "cron",
        cron: "0 7 * * *",
        timezone: "Europe/Paris",
      },
    });
    expect(data.wakeUps[0].conversation).toEqual({
      sId: conversation.sId,
      title: "Test Conversation",
    });
  });

  it("does not return the wake-ups of another member", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(
      workspace,
      otherUser,
      { role: "user" },
      undefined
    );
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      workspace.sId
    );

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(otherAuth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });
    await WakeUpFactory.cron(otherAuth, conversation, agentConfiguration);

    const response = await getUserWakeUps(workspace.sId);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalCount).toBe(0);
    expect(data.wakeUps).toEqual([]);
  });

  it("returns wake-ups in the requested status", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    const cancelledWakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration
    );
    await cancelledWakeUp.markCancelled(auth);
    await WakeUpFactory.cron(auth, conversation, agentConfiguration);

    const response = await getUserWakeUps(workspace.sId, "?status=cancelled");
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalCount).toBe(1);
    expect(data.wakeUps).toHaveLength(1);
    expect(data.wakeUps[0].wakeUp.sId).toBe(cancelledWakeUp.sId);
  });

  it("rejects an unknown status", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await getUserWakeUps(workspace.sId, "?status=snoozed");
    expect(response.status).toBe(400);
  });

  it("defaults to the scheduled wake-ups only", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    const cancelledWakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration,
      { reason: "cancelled one" }
    );
    await cancelledWakeUp.markCancelled(auth);

    const scheduledWakeUp = await WakeUpFactory.cron(
      auth,
      conversation,
      agentConfiguration,
      { reason: "scheduled one" }
    );

    const response = await getUserWakeUps(workspace.sId);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data.totalCount).toBe(1);
    expect(data.wakeUps).toHaveLength(1);
    expect(data.wakeUps[0].wakeUp.sId).toBe(scheduledWakeUp.sId);
  });

  it("paginates through the caller's wake-ups", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });

    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });

    await WakeUpFactory.cron(auth, conversation, agentConfiguration, {
      reason: "first",
    });
    await WakeUpFactory.cron(auth, conversation, agentConfiguration, {
      reason: "second",
    });

    const firstPage = await getUserWakeUps(workspace.sId, "?limit=1&offset=0");
    expect(firstPage.status).toBe(200);
    const firstPageData = await firstPage.json();
    expect(firstPageData.totalCount).toBe(2);
    expect(firstPageData.wakeUps).toHaveLength(1);

    const secondPage = await getUserWakeUps(workspace.sId, "?limit=1&offset=1");
    expect(secondPage.status).toBe(200);
    const secondPageData = await secondPage.json();
    expect(secondPageData.totalCount).toBe(2);
    expect(secondPageData.wakeUps).toHaveLength(1);
    expect(secondPageData.wakeUps[0].wakeUp.sId).not.toBe(
      firstPageData.wakeUps[0].wakeUp.sId
    );
  });

  it("returns an empty list when the caller has no wake-up", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await getUserWakeUps(workspace.sId);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ totalCount: 0, wakeUps: [] });
  });
});
