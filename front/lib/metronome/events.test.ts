import {
  buildLlmUsageEvents,
  buildToolUseEvents,
} from "@app/lib/metronome/events";
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
