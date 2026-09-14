import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { honoApp } from "@front-api/app";
import { QueryTypes } from "sequelize";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () => actual.frontSequelize,
  };
});

vi.mock("@app/lib/api/assistant/recent_authors", () => ({
  agentConfigurationWasUpdatedBy: vi.fn(),
  getAgentRecentAuthors: vi.fn().mockResolvedValue([]),
}));

function getFeedbackDistribution(
  workspace: { sId: string },
  aId: string,
  query: { days?: number } = {}
) {
  const params = new URLSearchParams();
  if (query.days !== undefined) {
    params.set("days", String(query.days));
  }
  const qs = params.toString();
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/agent_configurations/${aId}/observability/feedback-distribution${qs ? `?${qs}` : ""}`,
    { method: "GET" }
  );
}

async function createFeedback(
  auth: Authenticator,
  agentConfigurationId: string,
  thumbDirection: "up" | "down" = "up"
): Promise<AgentMessageFeedbackResource> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId,
    messagesCreatedAt: [new Date()],
  });

  const message = await MessageModel.findOne({
    where: {
      workspaceId: workspace.id,
      conversationId: conversation.id,
      rank: 1,
    },
  });
  if (!message) {
    throw new Error("No agent message found at rank 1");
  }
  const { agentMessage } = await ConversationFactory.getMessage(
    auth,
    message.id
  );

  return AgentMessageFeedbackResource.makeNew({
    workspaceId: workspace.id,
    agentConfigurationId,
    agentConfigurationVersion: 0,
    conversationId: conversation.id,
    agentMessageId: agentMessage!.id,
    userId: user.id,
    thumbDirection,
    content: null,
    isConversationShared: false,
    dismissed: false,
  });
}

async function setFeedbackCreatedAt(
  feedbackId: number,
  date: Date
): Promise<void> {
  // biome-ignore lint/plugin/noRawSql: updating createdAt for test setup requires raw SQL because Sequelize excludes it from Model.update by default.
  await frontSequelize.query(
    `UPDATE agent_message_feedbacks SET "createdAt" = :date WHERE id = :id`,
    {
      replacements: { date: date.toISOString(), id: feedbackId },
      type: QueryTypes.UPDATE,
    }
  );
}

describe("GET /api/w/:wId/assistant/agent_configurations/:aId/observability/feedback-distribution", () => {
  it("returns 404 when the agent does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({ method: "GET" });

    const response = await getFeedbackDistribution(
      workspace,
      "nonexistent-agent-id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { type: "agent_configuration_not_found" },
    });
  });

  it("returns empty points when no feedback exists for the agent", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const response = await getFeedbackDistribution(workspace, agent.sId, {
      days: 30,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ points: [] });
  });

  it("returns correct up/down counts grouped by day", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    await createFeedback(auth, agent.sId, "up");
    await createFeedback(auth, agent.sId, "up");
    await createFeedback(auth, agent.sId, "down");

    const response = await getFeedbackDistribution(workspace, agent.sId, {
      days: 30,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.points).toHaveLength(1);
    expect(body.points[0].positive).toBe(2);
    expect(body.points[0].negative).toBe(1);

    // The timestamp should correspond to today at midnight UTC.
    const todayMidnightUTC = new Date();
    todayMidnightUTC.setUTCHours(0, 0, 0, 0);
    expect(body.points[0].timestamp).toBe(todayMidnightUTC.getTime());
  });

  it("does not include feedback from other agents", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const agent1 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent 1",
    });
    const agent2 = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Agent 2",
    });

    await createFeedback(auth, agent2.sId, "up");

    const response = await getFeedbackDistribution(workspace, agent1.sId, {
      days: 30,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ points: [] });
  });

  it("excludes feedback older than the requested days window", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    const feedback = await createFeedback(auth, agent.sId, "up");

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    await setFeedbackCreatedAt(feedback.id, oldDate);

    const response = await getFeedbackDistribution(workspace, agent.sId, {
      days: 30,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ points: [] });
  });

  it("splits feedback across multiple days into separate points", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      method: "GET",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);

    await createFeedback(auth, agent.sId, "up");
    const feedback2 = await createFeedback(auth, agent.sId, "down");

    // Move feedback2 to yesterday.
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    await setFeedbackCreatedAt(feedback2.id, yesterday);

    const response = await getFeedbackDistribution(workspace, agent.sId, {
      days: 30,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    // Two distinct days: yesterday and today.
    expect(body.points).toHaveLength(2);

    // Points are ordered by day ascending.
    const [yesterdayPoint, todayPoint] = body.points;
    expect(yesterdayPoint.positive).toBe(0);
    expect(yesterdayPoint.negative).toBe(1);
    expect(todayPoint.positive).toBe(1);
    expect(todayPoint.negative).toBe(0);
  });
});
