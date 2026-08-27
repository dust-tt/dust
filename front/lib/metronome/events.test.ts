import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import {
  billedCostAwuFromEvents,
  buildLlmUsageEvents,
  buildToolUseEvents,
  buildUsageEvents,
} from "@app/lib/metronome/events";
import type { MetronomeEvent } from "@app/lib/metronome/types";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { describe, expect, it } from "vitest";

function usage(overrides: Partial<RunUsageType>): RunUsageType {
  return {
    completionTokens: 0,
    reasoningTokens: null,
    promptTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    costMicroUsd: 0,
    modelId: "gpt-4o",
    providerId: "openai",
    isBatch: false,
    ...overrides,
  };
}

const commonEventInput = {
  workspaceId: "workspace",
  conversationId: "conversation",
  userId: "user",
  isFreeSeatedUser: false,
  agentMessageId: "message",
  agentId: "agent",
  subAgentId: null,
  parentAgentMessageId: null,
  runKey: "execution",
  origin: "web" as const,
  usageType: "user" as const,
  authMethod: "session",
  apiKeyName: null,
  messageStatus: "succeeded",
  isSubAgentMessage: false,
  timestamp: "2026-08-05T12:00:00.000Z",
};

describe("Metronome billing event adapters", () => {
  it("emits the canonical LLM billing groups and credit amounts", () => {
    const events = buildLlmUsageEvents({
      ...commonEventInput,
      isByok: false,
      runUsages: [
        usage({ costMicroUsd: 1, promptTokens: 2 }),
        usage({ costMicroUsd: 2, promptTokens: 3 }),
        usage({
          costMicroUsd: 1,
          modelId: "claude-opus-4-8",
          providerId: "anthropic",
        }),
      ],
    });

    expect(events).toHaveLength(2);
    expect(events.map(({ properties }) => properties)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider_id: "openai",
          model_id: "gpt-4o",
          prompt_tokens: 5,
          cost_micro_usd: 3,
          cost_awu: 1,
        }),
        expect.objectContaining({
          provider_id: "anthropic",
          model_id: "claude-opus-4-8",
          cost_awu: 1,
        }),
      ])
    );
  });

  it("emits canonical tool categories and free-usage overrides", () => {
    const events = buildToolUseEvents({
      ...commonEventInput,
      actions: [
        {
          toolName: "websearch",
          mcpServerId: null,
          internalMCPServerName: "web_search_&_browse",
          status: "succeeded",
          executionDurationMs: 10,
          shouldEmit: true,
        },
        {
          toolName: "websearch",
          mcpServerId: null,
          internalMCPServerName: "web_search_&_browse",
          status: "succeeded",
          executionDurationMs: 20,
          shouldEmit: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      tool_category: "basic",
      count: 2,
      total_execution_duration_ms: 30,
      usage_type: "user",
    });
  });

  it("does not emit events for unbillable tool statuses", () => {
    const events = buildToolUseEvents({
      ...commonEventInput,
      actions: [
        {
          toolName: "custom_tool",
          mcpServerId: null,
          internalMCPServerName: null,
          status: "denied",
          executionDurationMs: null,
          shouldEmit: true,
        },
      ],
    });

    expect(events).toEqual([]);
  });

  it("splits paid and post-cap calls to the same tool", () => {
    const events = buildToolUseEvents({
      ...commonEventInput,
      actions: Array.from({ length: 8 }, () => ({
        toolName: "custom_tool",
        mcpServerId: "mcp_server",
        internalMCPServerName: null,
        status: "succeeded" as const,
        executionDurationMs: 10,
        shouldEmit: true,
      })),
    });

    expect(events).toHaveLength(2);
    expect(events.map(({ properties }) => properties)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 7, usage_type: "user" }),
        expect.objectContaining({ count: 1, usage_type: "free" }),
      ])
    );
    expect(
      new Set(events.map(({ transaction_id }) => transaction_id)).size
    ).toBe(2);
  });

  it("applies prior execution spend without re-emitting prior actions", () => {
    const events = buildToolUseEvents({
      ...commonEventInput,
      actions: [
        ...Array.from({ length: 7 }, () => ({
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded" as const,
          executionDurationMs: 10,
          shouldEmit: false,
        })),
        {
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded",
          executionDurationMs: 10,
          shouldEmit: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      count: 1,
      usage_type: "free",
    });
  });
});

describe("Aggregated usage event (shadow) and legacy cost parity", () => {
  const aggregatedInput = { ...commonEventInput, isByok: false };

  it("aggregates LLM and tool cost into a single llm_usage_v3 event", () => {
    const events = buildUsageEvents({
      ...aggregatedInput,
      runUsages: [usage({ costMicroUsd: 1 })],
      actions: [
        {
          toolName: "websearch",
          mcpServerId: null,
          internalMCPServerName: "web_search_&_browse",
          status: "succeeded",
          executionDurationMs: 10,
          shouldEmit: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("llm_usage_v3");
    expect(events[0]?.properties).toMatchObject({
      model_id: "aggregate",
      // LLM ceil(1/µ) = 1 + one "basic" (1 AWU) tool = 2.
      cost_awu: 2,
      usage_type: "user",
    });
  });

  it("matches the legacy events' billed cost on a mixed message", () => {
    const perAwu = MODEL_COST_MICRO_USD_PER_AWU_CREDIT;

    const runUsages = [
      // openai group: two usages summed (1 + 1 µUSD) THEN rounded → 1 credit.
      usage({ costMicroUsd: 1 }),
      usage({ costMicroUsd: 1 }),
      // anthropic group: rounded on its own → 2 credits.
      usage({
        costMicroUsd: perAwu + 1,
        modelId: "claude-opus-4-8",
        providerId: "anthropic",
      }),
    ];
    const actions = [
      // 8 external "advanced" (3 AWU) calls: 7 billed (21) + 1 capped (free).
      ...Array.from({ length: 8 }, () => ({
        toolName: "custom_tool",
        mcpServerId: "mcp_server",
        internalMCPServerName: null,
        status: "succeeded" as const,
        executionDurationMs: 10,
        shouldEmit: true,
      })),
      // One internal "basic" (1 AWU) billed call.
      {
        toolName: "websearch",
        mcpServerId: null,
        internalMCPServerName: "web_search_&_browse" as const,
        status: "succeeded" as const,
        executionDurationMs: 5,
        shouldEmit: true,
      },
      // A denied call: unbillable, must not contribute on either side.
      {
        toolName: "custom_tool",
        mcpServerId: null,
        internalMCPServerName: null,
        status: "denied" as const,
        executionDurationMs: null,
        shouldEmit: true,
      },
    ];

    const legacyEvents = [
      ...buildLlmUsageEvents({ ...aggregatedInput, runUsages }),
      ...buildToolUseEvents({ ...commonEventInput, actions }),
    ];
    const aggregatedEvents = buildUsageEvents({
      ...aggregatedInput,
      runUsages,
      actions,
    });

    // LLM 3 (1 + 2, per-model rounding) + tools 22 (7×3 capped + 1 basic) = 25.
    const newCostAwu = Number(aggregatedEvents[0]?.properties["cost_awu"]);
    expect(newCostAwu).toBe(25);
    expect(billedCostAwuFromEvents(legacyEvents)).toBe(newCostAwu);
  });

  it("matches (both zero) for free-origin messages", () => {
    const runUsages = [usage({ costMicroUsd: 1_000_000 })];
    const actions = [
      {
        toolName: "custom_tool",
        mcpServerId: "mcp_server",
        internalMCPServerName: null,
        status: "succeeded" as const,
        executionDurationMs: 10,
        shouldEmit: true,
      },
    ];
    const freeInput = {
      ...aggregatedInput,
      usageType: "free" as const,
      origin: "agent_sidekick" as const,
    };

    const legacyEvents = [
      ...buildLlmUsageEvents({ ...freeInput, runUsages }),
      ...buildToolUseEvents({
        ...commonEventInput,
        usageType: "free" as const,
        origin: "agent_sidekick" as const,
        actions,
      }),
    ];
    const aggregatedEvents = buildUsageEvents({
      ...freeInput,
      runUsages,
      actions,
    });

    const newCostAwu = aggregatedEvents.reduce(
      (total, event) => total + Number(event.properties["cost_awu"] ?? 0),
      0
    );
    expect(newCostAwu).toBe(0);
    expect(billedCostAwuFromEvents(legacyEvents)).toBe(0);
  });

  it("counts only user/programmatic usage types, skipping any other value", () => {
    const events: MetronomeEvent[] = [
      {
        transaction_id: "a",
        customer_id: "c",
        event_type: "llm_usage_v3",
        timestamp: "2026-08-05T12:00:00.000Z",
        properties: { cost_awu: 5, usage_type: "user" },
      },
      {
        transaction_id: "b",
        customer_id: "c",
        event_type: "llm_usage_v3",
        timestamp: "2026-08-05T12:00:00.000Z",
        properties: { cost_awu: 7, usage_type: "programmatic" },
      },
      {
        transaction_id: "c",
        customer_id: "c",
        event_type: "llm_usage_v3",
        timestamp: "2026-08-05T12:00:00.000Z",
        properties: { cost_awu: 11, usage_type: "free" },
      },
      // An unknown usage_type is entitled at 0 in the rate card — skip it.
      {
        transaction_id: "d",
        customer_id: "c",
        event_type: "tool_use_v3",
        timestamp: "2026-08-05T12:00:00.000Z",
        properties: {
          count: 4,
          tool_category: "advanced",
          usage_type: "other",
        },
      },
    ];

    // Only the "user" (5) and "programmatic" (7) events count.
    expect(billedCostAwuFromEvents(events)).toBe(12);
  });
});
