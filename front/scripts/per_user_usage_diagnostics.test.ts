import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import type { PerUserAwuUsageRow } from "@app/lib/metronome/per_user_usage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { MessageUsageSlice } from "@app/scripts/per_user_usage_diagnostics";
import {
  compareMessageUsage,
  dailyUsageComparison,
  diagnosticDayBreakdown,
  fetchDiagnosticMessageMetadata,
  fetchDiagnosticSlices,
} from "@app/scripts/per_user_usage_diagnostics";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/elasticsearch"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    searchAnalytics: vi.fn(),
    searchConsumptionAnalytics: vi.fn(),
  };
});

const scope = {
  userId: "user",
  isFreeSeat: false,
  cycleStart: new Date("2026-08-25T12:00:00.000Z"),
  cycleEnd: new Date("2026-09-25T12:00:00.000Z"),
};

function slice(
  messageId: string,
  credits: number,
  overrides: Partial<MessageUsageSlice> = {}
): MessageUsageSlice {
  return {
    messageId,
    creditMicro: Math.round(credits * 1_000_000),
    userId: scope.userId,
    seatType: null,
    timestamp: "2026-08-26T12:00:00.000Z",
    version: "0",
    documentCount: 1,
    creditsByStatus: {},
    creditsByUsageType: {},
    ...overrides,
  };
}

describe("compareMessageUsage", () => {
  it("accounts for the full signed ES delta, including consumption-only records", () => {
    const comparison = compareMessageUsage({
      scope,
      legacy: [
        slice("paused", 1074, { creditsByStatus: { created: 1074_000_000 } }),
        slice("changed", 100),
        slice("same", 20),
      ],
      consumption: [slice("changed", 80), slice("same", 20), slice("new", 30)],
    });
    expect(comparison.comparedMessages).toBe(4);
    expect(comparison.mismatchingMessages).toBe(3);
    expect(comparison.categories).toEqual({
      missing_consumption: {
        messageCount: 1,
        consumptionLegacyAwuCreditsDifference: -1074,
      },
      credit_amount_difference: {
        messageCount: 1,
        consumptionLegacyAwuCreditsDifference: -20,
      },
      missing_legacy: {
        messageCount: 1,
        consumptionLegacyAwuCreditsDifference: 30,
      },
    });
    expect(comparison.mismatches[0]).toMatchObject({
      messageId: "paused",
      legacy: { awuCreditsByStatus: { created: 1074 } },
    });
    expect(
      comparison.mismatches.reduce(
        (total, message) =>
          total + message.consumptionLegacyAwuCreditsDifference,
        0
      )
    ).toBe(-1064);
  });

  it("distinguishes excluded counterpart documents from absent documents", () => {
    const comparison = compareMessageUsage({
      scope,
      legacy: [
        slice("other-user", 10),
        slice("other-seat", 10),
        slice("other-cycle", 10),
        slice("no-time", 10),
      ],
      consumption: [
        slice("other-user", 10, { userId: null }),
        slice("other-seat", 10, { seatType: "free" }),
        slice("other-cycle", 10, { timestamp: "2026-08-25T11:00:00.000Z" }),
        slice("no-time", 10, { timestamp: null }),
      ],
    });
    expect(comparison.categories).toEqual({
      scope_or_amount_difference: {
        messageCount: 4,
        consumptionLegacyAwuCreditsDifference: -40,
      },
    });
    expect(
      comparison.mismatches.map(
        (message) => message.consumption.exclusionReasons
      )
    ).toEqual([
      ["different_or_missing_user"],
      ["different_seat_bucket"],
      ["outside_cycle"],
      ["missing_timestamp"],
    ]);
  });

  it("retains mixed slices, treats missing seats as paid, and does not round each message to credits", () => {
    const legacy = [slice("mixed", 1)];
    const consumption = [
      slice("mixed", 0.4),
      slice("mixed", 0.4, { seatType: "pro" }),
      slice("mixed", 10, { seatType: "free" }),
    ];
    const comparison = compareMessageUsage({ scope, legacy, consumption });
    expect(comparison.mismatches[0]).toMatchObject({
      consumptionLegacyAwuCreditsDifference: -0.2,
      consumption: {
        allAwuCredits: 10.8,
        selectedAwuCredits: 0.8,
        documentCount: 3,
      },
    });
    const free = compareMessageUsage({
      scope: { ...scope, isFreeSeat: true },
      legacy,
      consumption,
    });
    expect(free.mismatches[0]).toMatchObject({
      consumptionLegacyAwuCreditsDifference: 10,
      legacy: { selectedAwuCredits: 0 },
      consumption: { selectedAwuCredits: 10 },
    });
  });
});

describe("dailyUsageComparison", () => {
  it("keeps timestamp shifts visible and sums only the selected seat/user/cycle", () => {
    const metronome: PerUserAwuUsageRow = {
      userId: "user",
      metric: "llm_provider_cost_awu",
      usageType: "user",
      toolCategory: null,
      startingOn: "2026-08-26T12:00:00.000Z",
      endingBefore: "2026-08-26T13:00:00.000Z",
      awuCredits: 10,
      value: 10,
      awuWeight: 1,
    };
    const days = dailyUsageComparison({
      scope,
      legacy: [slice("m", 10)],
      consumption: [
        slice("m", 10, { timestamp: "2026-08-27T12:00:00.000Z" }),
        slice("free", 100, { seatType: "free" }),
        slice("other", 100, { userId: "other" }),
      ],
      metronome: [metronome],
    });
    expect(days).toEqual([
      {
        date: "2026-08-26",
        legacyAwuCredits: 10,
        consumptionAwuCredits: 0,
        metronomeAwuCredits: 10,
        consumptionMetronomeAwuCreditsDifference: -10,
      },
      {
        date: "2026-08-27",
        legacyAwuCredits: 0,
        consumptionAwuCredits: 10,
        metronomeAwuCredits: 0,
        consumptionMetronomeAwuCreditsDifference: 10,
      },
    ]);
  });
});

describe("diagnosticDayBreakdown", () => {
  it("includes ES matches, preserves outside-day counterparts, and separates hourly metric buckets", () => {
    const ai: PerUserAwuUsageRow = {
      userId: "user",
      metric: "llm_provider_cost_awu",
      usageType: "user",
      toolCategory: null,
      startingOn: "2026-08-26T12:00:00.000Z",
      endingBefore: "2026-08-26T13:00:00.000Z",
      awuCredits: 100,
      value: 100,
      awuWeight: 1,
    };
    const tool: PerUserAwuUsageRow = {
      ...ai,
      metric: "tool_invocations",
      toolCategory: "advanced",
      awuCredits: 6,
      value: 2,
      awuWeight: 3,
    };
    const result = diagnosticDayBreakdown({
      scope,
      date: "2026-08-26",
      sampleLimit: 2,
      legacy: [
        slice("matching", 90),
        slice("shifted", 10),
        slice("free", 500, { seatType: "free" }),
      ],
      consumption: [
        slice("matching", 90),
        slice("shifted", 10, { timestamp: "2026-08-27T13:00:00.000Z" }),
      ],
      metronome: [ai, tool, { ...ai, startingOn: "2026-08-27T12:00:00.000Z" }],
    });
    expect(result.candidateMessages).toBe(2);
    expect(result.messageSamples.map((sample) => sample.messageId)).toEqual([
      "matching",
      "shifted",
    ]);
    expect(result.messageSamples[1].consumption.timestamps).toEqual([
      "2026-08-27T13:00:00.000Z",
    ]);
    expect(result.metronomeBuckets).toEqual([ai, tool]);
    expect(result.hourlyUsage).toEqual([
      {
        date: "2026-08-26T12:00:00.000Z",
        legacyAwuCredits: 100,
        consumptionAwuCredits: 90,
        metronomeAwuCredits: 106,
        consumptionMetronomeAwuCreditsDifference: -16,
      },
    ]);
  });
});

describe("fetchDiagnosticSlices", () => {
  beforeEach(() => vi.clearAllMocks());

  const key = {
    message_id: "m",
    user_id: null,
    seat_type: null,
    timestamp: null,
    version: "0",
  };
  const response = {
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { hits: [] },
    aggregations: {
      slices: {
        after_key: key,
        buckets: [
          {
            key,
            doc_count: 2,
            credits: { value: 1_000_000 },
            by_status: {
              buckets: [{ key: "succeeded", credits: { value: 1_000_000 } }],
            },
          },
        ],
      },
    },
  };

  it("paginates with the returned cursor and preserves null metadata in counterpart lookups", async () => {
    vi.mocked(searchConsumptionAnalytics)
      .mockResolvedValueOnce(new Ok(response))
      .mockResolvedValueOnce(
        new Ok({ ...response, aggregations: { slices: { buckets: [] } } })
      );
    const filters = [{ terms: { agent_message_id: ["m"] } }];
    const result = await fetchDiagnosticSlices({
      source: "consumption",
      workspaceId: "w",
      filters,
    });
    expect(result).toEqual([
      slice("m", 1, {
        userId: null,
        timestamp: null,
        documentCount: 2,
        creditsByStatus: { succeeded: 1_000_000 },
      }),
    ]);
    expect(searchConsumptionAnalytics).toHaveBeenCalledTimes(2);
    expect(searchConsumptionAnalytics).toHaveBeenLastCalledWith(
      { bool: { filter: [{ term: { workspace_id: "w" } }, ...filters] } },
      expect.objectContaining({
        size: 0,
        aggregations: {
          slices: expect.objectContaining({
            composite: expect.objectContaining({ after: key }),
          }),
        },
      })
    );
    const options = vi.mocked(searchConsumptionAnalytics).mock.calls[0][1];
    expect(options?.aggregations?.slices.composite?.sources).toContainEqual({
      timestamp: { terms: { field: "completed_at", missing_bucket: true } },
    });
  });

  it.each([
    { ...response, timed_out: true },
    {
      ...response,
      _shards: { total: 2, successful: 1, skipped: 0, failed: 1 },
    },
    { ...response, aggregations: undefined },
  ])("rejects incomplete results instead of reporting records missing", async (partialResponse) => {
    vi.mocked(searchConsumptionAnalytics).mockResolvedValueOnce(
      new Ok(partialResponse)
    );
    await expect(
      fetchDiagnosticSlices({
        source: "consumption",
        workspaceId: "w",
        filters: [],
      })
    ).rejects.toThrow("Incomplete consumption message diagnostic query");
  });
});

describe("fetchDiagnosticMessageMetadata", () => {
  it("reads billed paused-message metadata, including deleted conversations, within one workspace", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      visibility: "deleted",
    });
    const message = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 0,
      agentConfigurationId: agent.sId,
      runIds: ["run-one", "run-two"],
    });
    assert(message.agentMessageId);
    await ConversationResource.updateAgentMessageCostCredits(auth, {
      agentMessageModelId: message.agentMessageId,
      costCredits: 1074,
    });
    const metadata = await fetchDiagnosticMessageMetadata(workspace, [
      message.sId,
      "missing",
    ]);
    expect(metadata.size).toBe(1);
    expect(metadata.get(message.sId)).toMatchObject({
      messageStatus: "created",
      costCredits: 1074,
      completedAt: null,
      runCount: 2,
      conversationId: conversation.sId,
      excludedByConsumptionStatusGate: false,
      updatedAt: expect.any(Date),
      triggeringUserMessage: null,
    });
    const other = await createResourceTest({ role: "admin" });
    const outsideWorkspace = await fetchDiagnosticMessageMetadata(
      other.workspace,
      [message.sId]
    );
    expect(outsideWorkspace.size).toBe(0);
    const empty = await fetchDiagnosticMessageMetadata(workspace, []);
    expect(empty.size).toBe(0);
  });
});
