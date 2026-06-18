import { computeAgentMessageCredits } from "@app/lib/api/assistant/credit_cost";
import {
  awuFromMicroUsd,
  intelligenceAwuFromRunUsages,
  intelligenceAwuFromRunUsagesGroupedByRunKey,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { describe, expect, it } from "vitest";

function usage(
  overrides: Partial<RunUsageType & { runKey: string | null }>
): RunUsageType & { runKey: string | null } {
  return {
    completionTokens: 0,
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
    const sameModel = intelligenceAwuFromRunUsages([
      usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
      usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
    ]);
    expect(sameModel).toBe(2);

    const twoModels = intelligenceAwuFromRunUsages([
      usage({ costMicroUsd: 5000, modelId: "gpt-4o", providerId: "openai" }),
      usage({
        costMicroUsd: 5000,
        modelId: "claude-opus-4-8",
        providerId: "anthropic",
      }),
    ]);
    // ceil(5000/8500)=1 per model -> 2.
    expect(twoModels).toBe(2);
  });

  it("returns 0 for no usages", () => {
    expect(intelligenceAwuFromRunUsages([])).toBe(0);
  });
});

describe("intelligenceAwuFromRunUsagesGroupedByRunKey", () => {
  it("ceils per runKey (execution) so it matches additive Metronome events on interrupt/resume", () => {
    // Ceiling over the union (the old behavior) would undercount: ceil(10000/8500)=2
    // here it happens to match, so use an uneven split to prove the difference.
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey([
      usage({ costMicroUsd: 9000, runKey: "exec1" }), // ceil -> 2
      usage({ costMicroUsd: 1000, runKey: "exec2" }), // ceil -> 1
    ]);
    expect(credits).toBe(3);
  });

  it("still ceils per (provider, model) within a single execution", () => {
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey([
      usage({ costMicroUsd: 5000, modelId: "gpt-4o", runKey: "exec1" }),
      usage({
        costMicroUsd: 5000,
        modelId: "claude-opus-4-8",
        providerId: "anthropic",
        runKey: "exec1",
      }),
    ]);
    // Same execution, two models: ceil(5000)=1 per model -> 2.
    expect(credits).toBe(2);
  });

  it("folds untagged (null runKey) usages into a single legacy group", () => {
    const credits = intelligenceAwuFromRunUsagesGroupedByRunKey([
      usage({ costMicroUsd: 9000, runKey: null }),
      usage({ costMicroUsd: 1000, runKey: null }),
    ]);
    // Both summed before ceiling: ceil(10000/8500) = 2.
    expect(credits).toBe(2);
  });
});

describe("toolAwuFromActions", () => {
  it("charges 1 credit for basic and 3 for advanced tools", () => {
    expect(
      toolAwuFromActions([
        { internalMCPServerName: "web_search_&_browse" }, // basic = 1
        { internalMCPServerName: "search" }, // advanced = 3
      ])
    ).toBe(4);
  });

  it("treats unknown / external servers as advanced (3)", () => {
    expect(toolAwuFromActions([{ internalMCPServerName: null }])).toBe(3);
  });

  it("does not charge for free tools (priced at 0 in the rate card)", () => {
    // agent_memory is in FREE_TOOL_SERVERS — billed free, so contributes 0.
    expect(
      toolAwuFromActions([{ internalMCPServerName: "agent_memory" }])
    ).toBe(0);
    expect(
      toolAwuFromActions([{ internalMCPServerName: "agent_memory" }])
    ).toBe(0);
  });
});

describe("computeAgentMessageCredits", () => {
  it("sums intelligence and tool credits", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // 1 intelligence credit
      actions: [{ internalMCPServerName: "search", status: "succeeded" }], // 3 tool credits
    });
    expect(credits).toBe(4);
  });

  it("ignores non-final actions", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [],
      actions: [{ internalMCPServerName: "search", status: "running" }],
    });
    expect(credits).toBeNull();
  });

  it("returns null when there is no billable usage", () => {
    expect(
      computeAgentMessageCredits({ runUsages: [], actions: [] })
    ).toBeNull();
  });

  it("costs 0 for free-origin usage (e.g. agent_sidekick), LLM and tools alike", () => {
    const credits = computeAgentMessageCredits({
      runUsages: [usage({ costMicroUsd: 8500 })], // would be 1 intelligence credit
      actions: [{ internalMCPServerName: "search", status: "succeeded" }], // would be 3 tool credits
      isFreeUsage: true,
    });
    expect(credits).toBe(0);
  });

  it("still returns null for free-origin usage when there is nothing to track", () => {
    expect(
      computeAgentMessageCredits({
        runUsages: [],
        actions: [],
        isFreeUsage: true,
      })
    ).toBeNull();
  });
});
