import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import { buildUsageEvents } from "@app/lib/metronome/events";
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
  isByok: false,
  conversationId: "conversation",
  userId: "user",
  isFreeSeatedUser: false,
  agentMessageId: "message",
  agentId: "agent",
  subAgentId: null,
  parentAgentMessageId: null,
  runKey: "execution",
  runUsages: [],
  actions: [],
  origin: "web" as const,
  usageType: "user" as const,
  authMethod: "session",
  apiKeyName: null,
  messageStatus: "succeeded",
  isSubAgentMessage: false,
  timestamp: "2026-08-05T12:00:00.000Z",
};

describe("Metronome aggregated usage event", () => {
  it("emits a single event summing LLM and tool cost", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      runUsages: [
        usage({ costMicroUsd: 1, promptTokens: 2 }),
        usage({ costMicroUsd: 2, promptTokens: 3 }),
        usage({
          costMicroUsd: 1,
          modelId: "claude-opus-4-8",
          providerId: "anthropic",
        }),
      ],
      actions: [
        {
          toolName: "websearch",
          mcpServerId: null,
          internalMCPServerName: "web_search_&_browse",
          status: "succeeded",
          shouldEmit: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.event_type).toBe("llm_usage_v3");
    expect(events[0]?.transaction_id).toBe(
      "usage3-workspace-conversation-message-execution"
    );
    expect(events[0]?.properties).toMatchObject({
      provider_id: "aggregate",
      model_id: "aggregate",
      // LLM: ceil(3/µ)=1 + ceil(1/µ)=1 = 2. Tool: one "basic" (1 AWU) call = 1.
      cost_awu: 3,
      prompt_tokens: 5,
      usage_type: "user",
    });
  });

  it("always emits the required billable shape with valid values", () => {
    // Even with no user / api key / agent, the required properties fall back to
    // valid, non-empty values so the billable metric's `exists` filters match.
    const events = buildUsageEvents({
      ...commonEventInput,
      userId: null,
      apiKeyName: null,
      agentId: null,
      runUsages: [usage({ costMicroUsd: 1 })],
    });

    expect(events).toHaveLength(1);
    const props = events[0]?.properties ?? {};
    for (const key of [
      "agent_id",
      "api_key_name",
      "cost_awu",
      "model_id",
      "origin",
      "usage_type",
      "user_id",
    ]) {
      expect(props[key]).toBeDefined();
    }
    expect(props["user_id"]).toBe("unknown");
    expect(props["api_key_name"]).toBe("unknown");
    expect(props["agent_id"]).toBe("unknown");
    expect(props["usage_type"]).toBe("user");
  });

  it("rounds LLM per model then adds tool weights flat, excluding free/capped", () => {
    const perAwu = MODEL_COST_MICRO_USD_PER_AWU_CREDIT;

    const events = buildUsageEvents({
      ...commonEventInput,
      runUsages: [
        // openai/gpt-4o group: two usages summed (1 + 1 µUSD) THEN rounded.
        usage({ costMicroUsd: 1 }),
        usage({ costMicroUsd: 1 }),
        // anthropic group: a separate model, rounded on its own.
        usage({
          costMicroUsd: perAwu + 1,
          modelId: "claude-opus-4-8",
          providerId: "anthropic",
        }),
      ],
      actions: [
        // 8 external "advanced" (3 AWU) calls on one server: the 20-credit
        // per-server cap is reached after 7 (21 credits), so the 8th is waived.
        ...Array.from({ length: 8 }, () => ({
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded" as const,
          shouldEmit: true,
        })),
        // A denied call is unbillable and must not contribute either.
        {
          toolName: "custom_tool",
          mcpServerId: null,
          internalMCPServerName: null,
          status: "denied" as const,
          shouldEmit: true,
        },
      ],
    });

    // LLM = ceil(2/µ) + ceil((µ+1)/µ) = 1 + 2 = 3 (never a single ceiling over
    // the combined micro-USD). Tools = 7 × 3 = 21 (capped 8th + denied add 0).
    expect(events[0]?.properties["cost_awu"]).toBe(24);

    // Guard against regressing to "round once at the end": ceil((2+µ+1)/µ) = 2.
    expect(Math.ceil((2 + perAwu + 1) / perAwu)).not.toBe(3);
  });

  it("emits an LLM-only event when there are no tool actions", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      runUsages: [usage({ costMicroUsd: 1 })],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      cost_awu: 1,
      usage_type: "user",
    });
  });

  it("emits no event when there is nothing to attribute", () => {
    const events = buildUsageEvents({ ...commonEventInput });

    expect(events).toEqual([]);
  });

  it("does not bill unbillable tool statuses", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      actions: [
        {
          toolName: "custom_tool",
          mcpServerId: null,
          internalMCPServerName: null,
          status: "denied",
          shouldEmit: true,
        },
      ],
    });

    // The action is emitted for observability but denied statuses are never
    // billed, so cost is 0.
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({ cost_awu: 0 });
  });

  it("waives per-server-capped tool calls in the net cost", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      actions: Array.from({ length: 8 }, () => ({
        toolName: "custom_tool",
        mcpServerId: "mcp_server",
        internalMCPServerName: null,
        status: "succeeded" as const,
        shouldEmit: true,
      })),
    });

    // External tools are "advanced" (3 AWU). The 20-credit per-server cap is
    // reached after 7 calls (21 credits); the 8th is waived. Net billed = 21.
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({ cost_awu: 21 });
  });

  it("applies the free_mcp_server_cap per server, not globally", () => {
    const serverActions = (mcpServerId: string) =>
      Array.from({ length: 8 }, () => ({
        toolName: "custom_tool",
        mcpServerId,
        internalMCPServerName: null,
        status: "succeeded" as const,
        shouldEmit: true,
      }));

    const events = buildUsageEvents({
      ...commonEventInput,
      actions: [
        ...serverActions("mcp_server_a"),
        ...serverActions("mcp_server_b"),
      ],
    });

    // 21 (server A) + 21 (server B) = 42; each server waives its own 8th call.
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({ cost_awu: 42 });
  });

  it("does not re-bill prior-execution actions", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      actions: [
        ...Array.from({ length: 7 }, () => ({
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded" as const,
          shouldEmit: false,
        })),
        {
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded",
          shouldEmit: true,
        },
      ],
    });

    // Prior actions already reached the cap, so this execution's only action is
    // waived: it is emitted but bills 0.
    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({ cost_awu: 0 });
  });

  it("bills nothing for free origins", () => {
    const events = buildUsageEvents({
      ...commonEventInput,
      usageType: "free",
      origin: "agent_sidekick",
      runUsages: [usage({ costMicroUsd: 1_000_000 })],
      actions: [
        {
          toolName: "custom_tool",
          mcpServerId: "mcp_server",
          internalMCPServerName: null,
          status: "succeeded",
          shouldEmit: true,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.properties).toMatchObject({
      cost_awu: 0,
      usage_type: "free",
    });
  });
});
