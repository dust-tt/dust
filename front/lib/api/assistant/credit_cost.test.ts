import {
  buildAgentMessageCreditsBreakdownFromConsumptionAnalytics,
  computeAgentMessageCredits,
  fetchAgentMessageConsumptionAnalyticsByMessageIds,
} from "@app/lib/api/assistant/credit_cost";
import { searchConsumptionAnalytics } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import {
  awuFromMicroUsd,
  intelligenceAwuFromRunUsages,
  intelligenceAwuFromRunUsagesGroupedByRunKey,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { Ok } from "@app/types/shared/result";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/elasticsearch", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/elasticsearch")>();
  return { ...actual, searchConsumptionAnalytics: vi.fn() };
});

const TEST_CONTEXT_ORIGIN: UserMessageOrigin = "api";

afterEach(() => {
  vi.mocked(searchConsumptionAnalytics).mockReset();
});

function usage(
  overrides: Partial<RunUsageType & { runKey: string | null }>
): RunUsageType & { runKey: string | null } {
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
    runKey: null,
    ...overrides,
  };
}

describe("fetchAgentMessageConsumptionAnalyticsByMessageIds", () => {
  it("fetches and groups consumption documents by agent message", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    vi.mocked(searchConsumptionAnalytics).mockResolvedValue(
      new Ok({
        took: 1,
        timed_out: false,
        _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
        hits: {
          total: { value: 2, relation: "eq" },
          hits: [
            {
              _index: "front.agent_message_consumption_analytics",
              _id: "llm",
              _source: {
                workspace_id: workspace.sId,
                agent_message_id: "message-1",
                completed_at: "2026-09-01T00:00:00.000Z",
                consumption_key: "llm-1",
                consumption_type: "llm",
                credit_micro: 1_000_000,
                gross_credit_micro: { direct: 0 },
                tool: null,
              },
              sort: ["2026-09-01T00:00:00.000Z", "message-1", "llm-1"],
            },
            {
              _index: "front.agent_message_consumption_analytics",
              _id: "tool",
              _source: {
                workspace_id: workspace.sId,
                agent_message_id: "message-1",
                completed_at: "2026-09-01T00:00:00.000Z",
                consumption_key: "tool-1",
                consumption_type: "tool",
                credit_micro: 3_000_000,
                gross_credit_micro: { direct: 3_000_000 },
                tool: { action_id: "action-1" },
              },
              sort: ["2026-09-01T00:00:00.000Z", "message-1", "tool-1"],
            },
          ],
        },
      })
    );

    const result = await fetchAgentMessageConsumptionAnalyticsByMessageIds(
      auth,
      {
        messageIds: ["message-1", "message-2"],
      }
    );

    expect(result.get("message-1")).toHaveLength(2);
    expect(result.has("message-2")).toBe(false);
    expect(searchConsumptionAnalytics).toHaveBeenCalledWith(
      {
        bool: {
          filter: [
            { term: { workspace_id: workspace.sId } },
            {
              terms: {
                agent_message_id: ["message-1", "message-2"],
              },
            },
          ],
        },
      },
      {
        size: 1_000,
        sort: [
          { completed_at: "asc" },
          { agent_message_id: "asc" },
          { consumption_key: "asc" },
        ],
        search_after: undefined,
      }
    );
  });
});

describe("buildAgentMessageCreditsBreakdownFromConsumptionAnalytics", () => {
  it("preserves the direct tool and remaining LLM credit split", () => {
    const breakdown = buildAgentMessageCreditsBreakdownFromConsumptionAnalytics(
      {
        documents: [
          {
            workspace_id: "workspace-1",
            agent_message_id: "message-1",
            completed_at: "2026-09-01T00:00:00.000Z",
            consumption_key: "llm-1",
            consumption_type: "llm",
            credit_micro: 2_000_000,
            gross_credit_micro: { direct: 0 },
            tool: null,
          },
          {
            workspace_id: "workspace-1",
            agent_message_id: "message-1",
            completed_at: "2026-09-01T00:00:00.000Z",
            consumption_key: "tool-free",
            consumption_type: "tool",
            credit_micro: 500_000,
            gross_credit_micro: { direct: 0 },
            tool: { action_id: "action-free" },
          },
          {
            workspace_id: "workspace-1",
            agent_message_id: "message-1",
            completed_at: "2026-09-01T00:00:00.000Z",
            consumption_key: "tool-paid",
            consumption_type: "tool",
            credit_micro: 4_500_000,
            gross_credit_micro: { direct: 3_000_000 },
            tool: { action_id: "action-paid" },
          },
        ],
        actions: [
          {
            actionId: "action-free",
            toolName: "retrieve",
            internalMCPServerName: "agent_memory",
            status: "succeeded",
          },
          {
            actionId: "action-paid",
            toolName: "semantic_search",
            internalMCPServerName: "search",
            status: "succeeded",
          },
        ],
      }
    );

    expect(breakdown).toEqual({
      llmAwu: 4,
      toolAwu: 3,
      totalAwu: 7,
      byTool: [
        {
          actionId: "action-free",
          toolName: "retrieve",
          internalMCPServerName: "agent_memory",
          toolCostCategory: "basic",
          free: true,
          awu: 0,
        },
        {
          actionId: "action-paid",
          toolName: "semantic_search",
          internalMCPServerName: "search",
          toolCostCategory: "advanced",
          free: false,
          awu: 3,
        },
      ],
    });
  });

  it("returns no breakdown when consumption analytics are unavailable", () => {
    expect(
      buildAgentMessageCreditsBreakdownFromConsumptionAnalytics({
        documents: undefined,
        actions: [],
      })
    ).toBeUndefined();
  });
});

describe("awuFromMicroUsd", () => {
  it("converts at 1 credit = $0.0085 (8500 microUSD), rounding up", () => {
    // 8500 microUSD = exactly 1 credit.
    expect(awuFromMicroUsd(8500)).toBe(1);
    // Any non-zero cost rounds up to at least 1 credit.
    expect(awuFromMicroUsd(1)).toBe(1);
    // 17000 microUSD = 2 credits.
    expect(awuFromMicroUsd(17000)).toBe(2);
    // 0 cost = 0 credits.
    expect(awuFromMicroUsd(0)).toBe(0);
  });
});

describe("intelligenceAwuFromRunUsages", () => {
  it("groups by model and ceils per group before summing", () => {
    const sameModel = intelligenceAwuFromRunUsages(
      [
        usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
        usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
      ],
      TEST_CONTEXT_ORIGIN
    );
    expect(sameModel).toBe(2);

    const twoModels = intelligenceAwuFromRunUsages(
      [
        usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
        usage({
          costMicroUsd: 5000,
          modelId: "claude-opus-4-8",
          providerId: "anthropic",
        }),
      ],
      TEST_CONTEXT_ORIGIN
    );
    // ceil(5000/8500)=1 per model -> 2.
    expect(twoModels).toBe(2);
  });

  it("returns 0 for no usages", () => {
    expect(intelligenceAwuFromRunUsages([], TEST_CONTEXT_ORIGIN)).toBe(0);
  });
});

describe("intelligenceAwuFromRunUsagesGroupedByRunKey", () => {
  it("ceils per runKey (execution) so it matches additive Metronome events on interrupt/resume", () => {
    // Ceiling over the union (the old behavior) would undercount: ceil(10000/8500)=2
    // here it happens to match, so use an uneven split to prove the difference.
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey(
      [
        usage({ costMicroUsd: 9000, runKey: "exec1" }), // ceil -> 2
        usage({ costMicroUsd: 1000, runKey: "exec2" }), // ceil -> 1
      ],
      TEST_CONTEXT_ORIGIN
    );
    expect(credits).toBe(3);
  });

  it("still ceils per (provider, model) within a single execution", () => {
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey(
      [
        usage({ costMicroUsd: 5000, modelId: "gpt-4o", runKey: "exec1" }),
        usage({
          costMicroUsd: 5000,
          modelId: "claude-opus-4-8",
          providerId: "anthropic",
          runKey: "exec1",
        }),
      ],
      TEST_CONTEXT_ORIGIN
    );
    // Same execution, two models: ceil(5000)=1 per model -> 2.
    expect(credits).toBe(2);
  });

  it("folds untagged (null runKey) usages into a single legacy group", () => {
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey(
      [
        usage({ costMicroUsd: 9000, runKey: null }),
        usage({ costMicroUsd: 1000, runKey: null }),
      ],
      TEST_CONTEXT_ORIGIN
    );
    // Both summed before ceiling: ceil(10000/8500) = 2.
    expect(credits).toBe(2);
  });
});

describe("toolAwuFromActions", () => {
  it("charges 1 credit for basic and 3 for advanced tools", () => {
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "websearch",
            internalMCPServerName: "web_search_&_browse",
            status: "succeeded",
          }, // basic = 1
          {
            toolName: "semantic_search",
            internalMCPServerName: "search",
            status: "succeeded",
          }, // advanced = 3
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(4);
  });

  it("treats unknown / external servers as advanced (3)", () => {
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "custom_tool",
            internalMCPServerName: null,
            status: "succeeded",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(3);
  });

  it("does not charge for free tools (priced at 0 in the rate card)", () => {
    // agent_memory has toolCategory "basic" + freeUsage true — contributes 0.
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "retrieve",
            internalMCPServerName: "agent_memory",
            status: "succeeded",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(0);
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "record_entries",
            internalMCPServerName: "agent_memory",
            status: "succeeded",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(0);
  });

  it("charges for a tool that ran and failed on its own terms", () => {
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "semantic_search",
            internalMCPServerName: "search",
            status: "errored",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(3);
  });

  it("does not charge for a denied tool, which never reached the tool", () => {
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "semantic_search",
            internalMCPServerName: "search",
            status: "denied",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(0);
  });

  it("does not charge for a tool still awaiting approval", () => {
    expect(
      toolAwuFromActions(
        [
          {
            toolName: "semantic_search",
            internalMCPServerName: "search",
            status: "blocked_validation_required",
          },
        ],
        TEST_CONTEXT_ORIGIN
      )
    ).toBe(0);
  });
});

describe("computeAgentMessageCredits", () => {
  it("sums intelligence and tool credits", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // 1 intelligence credit
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "succeeded",
        },
      ], // 3 tool credits
      contextOrigin: TEST_CONTEXT_ORIGIN,
    });
    expect(credits).toBe(4);
  });

  it("ignores actions that have not run yet", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [],
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "running",
        },
      ],
      contextOrigin: TEST_CONTEXT_ORIGIN,
    });
    expect(credits).toBeNull();
  });

  it("ignores denied actions, which the user rejected before they ran", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [],
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "denied",
        },
      ],
      contextOrigin: TEST_CONTEXT_ORIGIN,
    });
    expect(credits).toBeNull();
  });

  it("bills the intelligence spent emitting a call the user then denied", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // 1 intelligence credit
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "denied",
        },
      ], // no tool credits
      contextOrigin: TEST_CONTEXT_ORIGIN,
    });
    expect(credits).toBe(1);
  });

  it("returns null when there is no billable usage", () => {
    expect(
      computeAgentMessageCredits({
        runUsages: [],
        actions: [],
        contextOrigin: TEST_CONTEXT_ORIGIN,
      })
    ).toBeNull();
  });

  it("costs 0 for free-origin usage (e.g. agent_sidekick), LLM and tools alike", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // would be 1 intelligence credit
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "succeeded",
        },
      ], // would be 3 tool credits
      contextOrigin: "agent_sidekick",
    });
    expect(credits).toBe(0);
  });

  it("still returns null for free-origin usage when there is nothing to track", () => {
    expect(
      computeAgentMessageCredits({
        runUsages: [],
        actions: [],
        contextOrigin: "agent_sidekick",
      })
    ).toBeNull();
  });

  it("costs 0 for the Activation Pod nudge, LLM and tools alike", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // would be 1 intelligence credit
      actions: [
        {
          toolName: "semantic_search",
          internalMCPServerName: "search",
          status: "succeeded",
        },
      ], // would be 3 tool credits
      contextOrigin: "system_activation",
    });
    expect(credits).toBe(0);
  });
});
