import { applyConsumptionEventsActivity } from "@app/temporal/consumption/activities";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  applyExecutionTotal: vi.fn(),
  indexConsumption: vi.fn(),
  listUnprocessed: vi.fn(),
  maxIdForAgentMessage: vi.fn(),
  sumExecution: vi.fn(),
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

vi.mock("@app/lib/api/assistant/consumption/root_hash", () => ({
  applyConsumptionExecutionTotal: mocks.applyExecutionTotal,
  readConsumptionExecutionTotal: vi.fn(),
}));

vi.mock("@app/lib/resources/agent_message_consumption_event_resource", () => ({
  AgentMessageConsumptionEventResource: {
    listUnprocessed: mocks.listUnprocessed,
    maxIdForAgentMessage: mocks.maxIdForAgentMessage,
  },
}));

vi.mock("@app/lib/resources/agent_message_consumption_item_resource", () => ({
  AgentMessageConsumptionItemResource: {
    sumConsumptionCreditAmountMicroByRunKey: mocks.sumExecution,
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
    mocks.sumExecution.mockResolvedValue(123);
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
        subagentAgentMessageId: null,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: "root-message",
      },
      {
        id: 41,
        agentMessageId: 7,
        consumptionMode: null,
        subagentAgentMessageId: null,
        createdAt,
        kind: "items_changed",
        rootAgentMessageId: "root-message",
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
      eventIds: [40, 41],
      esPending: false,
      finalizedExecution: null,
      hasMore: false,
    });
  });
});
