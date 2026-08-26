import {
  applyConsumptionEventsActivity,
  billExecutionActivity,
} from "@app/temporal/credit_consumption/activities";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  billExecution: vi.fn(),
  fetchAnalyticsContext: vi.fn(),
  indexConsumption: vi.fn(),
  listUnprocessed: vi.fn(),
  maxIdForAgentMessage: vi.fn(),
}));

vi.mock("@app/lib/auth", () => ({
  Authenticator: {
    fromJSON: vi.fn().mockResolvedValue({
      getNonNullableWorkspace: () => ({ sId: "workspace" }),
    }),
  },
}));

vi.mock("@app/lib/analytics/agent_message_consumption", () => ({
  indexAgentMessageConsumptionSnapshot: mocks.indexConsumption,
}));

vi.mock("@app/lib/api/assistant/consumption/bill", () => ({
  billExecution: mocks.billExecution,
}));

vi.mock("@app/lib/resources/conversation_resource", () => ({
  ConversationResource: {
    fetchAgentMessageConsumptionAnalyticsContext: mocks.fetchAnalyticsContext,
  },
}));

vi.mock("@app/lib/api/assistant/credit_counters", () => ({
  recordAgentMessageCreditCounters: vi.fn(),
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
});
