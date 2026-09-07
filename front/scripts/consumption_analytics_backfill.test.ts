import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { listConsumptionAnalyticsBackfillMessages } from "@app/scripts/consumption_analytics_backfill";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import assert from "assert";
import { describe, expect, it } from "vitest";

describe("listConsumptionAnalyticsBackfillMessages", () => {
  it("includes billed pauses and terminal messages with scoped, half-open dates and cursor pagination", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "deleted",
    });
    const fromDate = new Date("2026-08-25T12:00:00.000Z");
    const toDate = new Date("2026-09-25T12:00:00.000Z");
    const scenarios: Array<{
      status: AgentMessageStatus;
      completedAt: Date | null;
      updatedAt: Date;
      costCredits: number | null;
      runIds: string[] | null;
    }> = [
      {
        status: "created",
        completedAt: null,
        updatedAt: fromDate,
        costCredits: 10,
        runIds: ["run"],
      },
      // Terminal selection must use completedAt, even if another update happens after the window.
      {
        status: "succeeded",
        completedAt: fromDate,
        updatedAt: toDate,
        costCredits: 20,
        runIds: ["run"],
      },
      {
        status: "created",
        completedAt: null,
        updatedAt: toDate,
        costCredits: 10,
        runIds: ["run"],
      },
      {
        status: "succeeded",
        completedAt: toDate,
        updatedAt: fromDate,
        costCredits: 10,
        runIds: ["run"],
      },
      {
        status: "failed",
        completedAt: fromDate,
        updatedAt: fromDate,
        costCredits: 10,
        runIds: ["run"],
      },
      {
        status: "created",
        completedAt: null,
        updatedAt: fromDate,
        costCredits: null,
        runIds: ["run"],
      },
      {
        status: "created",
        completedAt: null,
        updatedAt: fromDate,
        costCredits: 10,
        runIds: null,
      },
    ];
    const messageIds: number[] = [];
    for (const [rank, scenario] of scenarios.entries()) {
      const message = await ConversationFactory.createAgentMessageWithRank({
        workspace,
        conversationId: conversation.id,
        rank,
        agentConfigurationId: agent.sId,
      });
      assert(message.agentMessageId);
      const { updatedAt, ...values } = scenario;
      await AgentMessageModel.update(values, {
        where: { id: message.agentMessageId, workspaceId: workspace.id },
      });
      await ConversationFactory.setAgentMessageUpdatedAtForTest(
        auth,
        message.agentMessageId,
        updatedAt
      );
      messageIds.push(message.agentMessageId);
    }
    const params = {
      workspace,
      fromDate,
      toDate,
      afterAgentMessageModelId: 0,
      batchSize: 100,
    };
    const candidates = await listConsumptionAnalyticsBackfillMessages(params);
    expect(candidates.map((message) => message.id)).toEqual(
      messageIds.slice(0, 2)
    );
    const page = await listConsumptionAnalyticsBackfillMessages({
      ...params,
      batchSize: 1,
    });
    expect(page.map((message) => message.id)).toEqual([messageIds[0]]);
    const next = await listConsumptionAnalyticsBackfillMessages({
      ...params,
      afterAgentMessageModelId: messageIds[0],
    });
    expect(next.map((message) => message.id)).toEqual([messageIds[1]]);
    const other = await createResourceTest({ role: "admin" });
    const outsideWorkspace = await listConsumptionAnalyticsBackfillMessages({
      ...params,
      workspace: other.workspace,
    });
    expect(outsideWorkspace).toEqual([]);
  });
});
