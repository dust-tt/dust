import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import {
  getChronologicalRunsForAgentMessage,
  inferDustRunIdForStepContent,
  listStepContentBatch,
} from "@app/scripts/backfill_agent_step_content_dust_run_ids";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

describe("inferDustRunIdForStepContent", () => {
  const runs = [
    {
      dustRunId: "run-0",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      runModelId: 10,
    },
    {
      dustRunId: "run-1",
      createdAt: new Date("2026-08-01T00:01:00.000Z"),
      runModelId: 11,
    },
    {
      dustRunId: "run-2",
      createdAt: new Date("2026-08-01T00:02:00.000Z"),
      runModelId: 12,
    },
  ];
  const runByDustRunId = new Map(runs.map((run) => [run.dustRunId, run]));

  it("orders and deduplicates the message run ids", () => {
    expect(
      getChronologicalRunsForAgentMessage(
        ["run-2", "run-0", "run-1", "run-1"],
        runByDustRunId
      )?.map((run) => run.dustRunId)
    ).toEqual(["run-0", "run-1", "run-2"]);
  });

  it("does not infer when an in-progress message references a run that is not persisted yet", () => {
    expect(
      getChronologicalRunsForAgentMessage(
        ["run-0", "run-not-persisted-yet"],
        runByDustRunId
      )
    ).toBeNull();
  });

  it("matches the run at the content step within its timestamp bounds", () => {
    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:01:30.000Z"),
        },
        runs
      )
    ).toBe("run-1");
  });

  it("does not guess when the step and run chronology disagree", () => {
    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:00:30.000Z"),
        },
        runs
      )
    ).toBeNull();

    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:02:30.000Z"),
        },
        runs
      )
    ).toBeNull();

    expect(
      inferDustRunIdForStepContent(
        {
          step: 3,
          createdAt: new Date("2026-08-01T00:03:30.000Z"),
        },
        runs
      )
    ).toBeNull();
  });
});

describe("listStepContentBatch", () => {
  it("advances a bounded scan past rows that are not backfill candidates", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    const conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const agentMessage = await AgentMessageModel.create({
      agentConfigurationId: agent.sId,
      agentConfigurationVersion: agent.version,
      conversationId: conversation.id,
      runIds: ["run-0"],
      skipToolsValidation: true,
      status: "succeeded",
      workspaceId: workspace.id,
    });
    const fromDate = new Date("2026-08-01T00:00:00.000Z");
    const toDate = new Date("2026-08-02T00:00:00.000Z");
    const rows = await AgentStepContentModel.bulkCreate(
      [
        {
          createdAt: new Date("2026-07-31T23:59:00.000Z"),
          dustRunId: null,
        },
        {
          createdAt: new Date("2026-08-01T00:01:00.000Z"),
          dustRunId: "already-stamped",
        },
        {
          createdAt: new Date("2026-08-01T00:02:00.000Z"),
          dustRunId: null,
        },
        {
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
          dustRunId: null,
        },
      ].map(({ createdAt, dustRunId }, index) => ({
        agentMessageId: agentMessage.id,
        createdAt,
        dustRunId,
        index,
        step: 0,
        type: "text_content" as const,
        value: { type: "text_content" as const, value: `content-${index}` },
        version: 0,
        workspaceId: workspace.id,
      })),
      { returning: true }
    );

    const firstBatch = await listStepContentBatch({
      afterCursor: null,
      batchSize: 2,
      fromDate,
      toDate,
      workspace,
    });

    expect(firstBatch.scannedCount).toBe(2);
    expect(firstBatch.candidates).toEqual([]);
    expect(firstBatch.nextCursor).toEqual({
      agentMessageModelId: agentMessage.id,
      step: 0,
      index: 1,
      version: 0,
    });

    const secondBatch = await listStepContentBatch({
      afterCursor: firstBatch.nextCursor,
      batchSize: 2,
      fromDate,
      toDate,
      workspace,
    });

    expect(secondBatch.scannedCount).toBe(2);
    expect(secondBatch.candidates.map((candidate) => candidate.id)).toEqual([
      rows[2].id,
    ]);
    expect(secondBatch.nextCursor).toEqual({
      agentMessageModelId: agentMessage.id,
      step: 0,
      index: 3,
      version: 0,
    });
  });
});
