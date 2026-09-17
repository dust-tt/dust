import {
  applyConsumptionEventsActivity,
  billExecutionActivity,
} from "@app/temporal/credit_consumption/activities";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billExecution: vi.fn(),
  emitUsageEvent: vi.fn(),
  fetchAnalyticsContext: vi.fn(),
  indexConsumption: vi.fn(),
  listUnprocessed: vi.fn(),
  maxIdForAgentMessage: vi.fn(),
  recordCreditCounters: vi.fn(),
  updateCostCredits: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJSON: vi.fn().mockResolvedValue({
      getNonNullableWorkspace: () => ({
        sId: "workspace",
        metronomeCustomerId: null,
      }),
    }),
  },
}));

vi.mock("@app/lib/api/analytics/agent_message_consumption", () => ({
  indexAgentMessageConsumptionSnapshot: mocks.indexConsumption,
}));

vi.mock("@app/lib/api/assistant/consumption/bill", () => ({
  billExecution: mocks.billExecution,
}));

vi.mock("@app/lib/api/assistant/consumption/usage_event", () => ({
  emitAgentMessageUsageEvent: mocks.emitUsageEvent,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageConsumptionAnalyticsContext: mocks.fetchAnalyticsContext,
    updateAgentMessageCostCreditsAtLeast: mocks.updateCostCredits,
  },
}));

vi.mock("@app/lib/api/assistant/credit_counters", () => ({
  recordAgentMessageCreditCounters: mocks.recordCreditCounters,
}));

vi.mock("@app/lib/resources/agent_message_consumption_event_resource", () => ({
  AgentMessageConsumptionEventResource: {
    listUnprocessed: mocks.listUnprocessed,
    maxIdForAgentMessage: mocks.maxIdForAgentMessage,
  },
}));

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    distribution: vi.fn(),
    gauge: vi.fn(),
    increment: vi.fn(),
  },
}));

describe("applyConsumptionEventsActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.maxIdForAgentMessage.mockResolvedValue(42);
    mocks.indexConsumption.mockResolvedValue({
      isErr: () => false,
      value: { versionConflictCount: 0 },
    });
  });

  it("upserts one Elasticsearch snapshot before acknowledging a message batch", async () => {
    const createdAt = new Date("2026-08-27T12:00:00.000Z");
    mocks.listUnprocessed.mockResolvedValue([
      {
        id: 40,
        agentMessageId: 7,
        consumptionMode: null,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: 101,
      },
      {
        id: 41,
        agentMessageId: 7,
        consumptionMode: null,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: 101,
      },
    ]);

    const result = await applyConsumptionEventsActivity(
      {
        authMethod: "session",
        workspaceId: "workspace",
        userId: null,
        role: "admin",
        groupIds: [],
        subscriptionId: null,
        isByok: false,
      },
      { runKey: "execution-x" }
    );

    expect(mocks.indexConsumption).toHaveBeenCalledOnce();
    expect(mocks.indexConsumption).toHaveBeenCalledWith(expect.anything(), {
      agentMessageModelId: 7,
      eventModelId: 42,
    });
    expect(result).toMatchObject({
      eventModelIds: [40, 41],
      esPending: false,
      finalizedExecution: null,
      hasMore: false,
    });
  });

  it("quarantines events when one run key changes message identity", async () => {
    const createdAt = new Date("2026-08-27T12:00:00.000Z");
    mocks.listUnprocessed.mockResolvedValue([
      {
        id: 40,
        agentMessageId: 7,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: 101,
      },
      {
        id: 41,
        agentMessageId: 8,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: 102,
      },
    ]);

    const result = await applyConsumptionEventsActivity(
      {
        authMethod: "session",
        workspaceId: "workspace",
        userId: null,
        role: "admin",
        groupIds: [],
        subscriptionId: null,
        isByok: false,
      },
      { runKey: "execution-x" }
    );

    expect(result).toEqual({
      eventModelIds: [40, 41],
      esPending: false,
      finalizedExecution: null,
      hasMore: false,
    });
    expect(mocks.indexConsumption).not.toHaveBeenCalled();
  });
});

describe("billExecutionActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acknowledges a finalized event whose message was deleted", async () => {
    mocks.fetchAnalyticsContext.mockResolvedValue(null);

    await expect(
      billExecutionActivity(
        {
          authMethod: "session",
          workspaceId: "workspace",
          userId: null,
          role: "admin",
          groupIds: [],
          subscriptionId: null,
          isByok: false,
        },
        {
          agentMessageModelId: 7,
          consumptionMode: "live",
          rootAgentMessageId: 101,
          runKey: "execution-x",
          status: "failed",
          timestamp: "2026-08-27T12:00:00.000Z",
        }
      )
    ).resolves.toBeUndefined();
    expect(mocks.billExecution).not.toHaveBeenCalled();
  });

  it("records live fair-use counters without a Metronome customer", async () => {
    mocks.fetchAnalyticsContext.mockResolvedValue({
      agentMessage: { agentMessageId: "agent-message" },
    });
    mocks.billExecution.mockResolvedValue({
      userMessageOrigin: "web",
      eventCreditAmount: 21,
      costCredits: 21,
      runUsageModelIds: [],
      actionModelIds: [],
    });

    await billExecutionActivity(
      {
        authMethod: "session",
        workspaceId: "workspace",
        userId: null,
        role: "admin",
        groupIds: [],
        subscriptionId: null,
        isByok: false,
      },
      {
        agentMessageModelId: 7,
        consumptionMode: "live",
        rootAgentMessageId: 7,
        runKey: "execution-x",
        status: "succeeded",
        timestamp: "2026-09-18T08:00:00.000Z",
      }
    );

    expect(mocks.recordCreditCounters).toHaveBeenCalledWith(expect.anything(), {
      creditAmount: 21,
      idempotencyKey: "consumption:7:execution-x",
      throwOnError: true,
      userMessageOrigin: "web",
    });
    expect(mocks.emitUsageEvent).toHaveBeenCalledOnce();
  });
});
