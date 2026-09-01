import { fetchFeedbackExportRows } from "@app/lib/api/analytics/feedback_export";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { getNamespace } from "@app/tests/utils/test_cls";
import type { ModelId } from "@app/types/shared/model_id";
import moment from "moment-timezone";
import { describe, expect, it, vi } from "vitest";

// fetchAgentMetadata and fetchFeedbackExportRows read from the read replica;
// in tests there is no replica, so point them at the primary test connection.
// `.transaction()` is stubbed to reuse the per-test transaction bound by
// vite.setup.ts instead of opening a genuinely separate one: a real second
// transaction would run on its own connection and, under normal Postgres
// isolation, would never see the still-uncommitted fixtures the test just
// created.
vi.mock("@app/lib/resources/storage", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/resources/storage")>();
  return {
    ...actual,
    getFrontReplicaDbConnection: () =>
      new Proxy(actual.frontSequelize, {
        get(target, prop, receiver) {
          if (prop === "transaction") {
            return (callback: (transaction: unknown) => unknown) =>
              callback(getNamespace("test-namespace")?.get("transaction"));
          }
          return Reflect.get(target, prop, receiver);
        },
      }),
  };
});

describe("fetchFeedbackExportRows", () => {
  it("reads feedback from Postgres, resolving agent name, user sId/email, and the conversation URL", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 0,
      agentConfigurationId: agent.sId,
    });

    const feedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conv.id as ModelId,
      agentMessageId: messageRow.agentMessageId!,
      userId: user.id,
      thumbDirection: "up",
      content: "Great answer",
      isConversationShared: true,
      dismissed: false,
    });

    const today = moment.utc();
    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate: today.clone().subtract(1, "day").format("YYYY-MM-DD"),
      endDate: today.clone().add(1, "day").format("YYYY-MM-DD"),
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }

    expect(result.value).toHaveLength(1);
    expect(result.value[0]).toEqual({
      feedbackId: feedback.sId,
      createdAt: moment(feedback.createdAt).utc().format("YYYY-MM-DD HH:mm:ss"),
      assistantId: agent.sId,
      assistantName: "Test Agent",
      conversationUrl: expect.stringContaining(conv.sId),
      userId: user.sId,
      userEmail: user.email ?? "",
      thumb: "up",
      content: "Great answer",
      dismissed: "false",
    });
  });

  it("returns an empty array when there is no feedback in the requested window", async () => {
    const { workspace } = await createResourceTest({ role: "builder" });

    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate: "2024-01-01",
      endDate: "2024-01-31",
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });

  it("includes feedback created exactly at the start-of-day boundary", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 0,
      agentConfigurationId: agent.sId,
    });

    const startDate = moment.utc().format("YYYY-MM-DD");
    const startOfDay = moment.utc(startDate, "YYYY-MM-DD").startOf("day");

    const feedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conv.id as ModelId,
      agentMessageId: messageRow.agentMessageId!,
      userId: user.id,
      thumbDirection: "up",
      content: "Right at midnight",
      isConversationShared: true,
      dismissed: false,
      createdAt: startOfDay.toDate(),
    });

    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate,
      endDate: startDate,
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value.map((r) => r.feedbackId)).toContain(feedback.sId);
  });

  it("keeps the row with an empty user fallback when the feedback author was deleted", async () => {
    const { authenticator, workspace, user } = await createResourceTest({
      role: "builder",
    });

    const agent = await AgentConfigurationFactory.createTestAgent(
      authenticator,
      { name: "Test Agent" }
    );

    const conv = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const messageRow = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conv.id as ModelId,
      rank: 0,
      agentConfigurationId: agent.sId,
    });

    const feedback = await AgentMessageFeedbackResource.makeNew({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conv.id as ModelId,
      agentMessageId: messageRow.agentMessageId!,
      userId: user.id,
      thumbDirection: "up",
      content: "Author gets deleted",
      isConversationShared: true,
      dismissed: false,
    });

    // Simulate the ON DELETE SET NULL that fires when the author's user row
    // is deleted: the model's TS type doesn't allow a null userId (it
    // predates the SET NULL constraint), so go through raw SQL instead.
    // biome-ignore lint/plugin/noRawSql: simulating a DB-level FK nullification not representable via the typed model API.
    await frontSequelize.query(
      'UPDATE "agent_message_feedbacks" SET "userId" = NULL WHERE id = :id',
      { replacements: { id: feedback.id } }
    );

    const today = moment.utc();
    const result = await fetchFeedbackExportRows({
      owner: workspace,
      startDate: today.clone().subtract(1, "day").format("YYYY-MM-DD"),
      endDate: today.clone().add(1, "day").format("YYYY-MM-DD"),
      timezone: "UTC",
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      throw result.error;
    }
    const row = result.value.find((r) => r.feedbackId === feedback.sId);
    expect(row).toBeDefined();
    expect(row?.userId).toEqual("");
    expect(row?.userEmail).toEqual("");
  });
});
