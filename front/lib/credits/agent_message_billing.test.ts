import type { AgentMessageBillingRunUsage } from "@app/lib/credits/agent_message_billing";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import { describe, expect, it } from "vitest";

function usage(
  overrides: Partial<AgentMessageBillingRunUsage>
): AgentMessageBillingRunUsage {
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

describe("buildAgentMessageBillingPlan", () => {
  it("groups LLM usage by execution and model and exposes deterministic allocations", () => {
    const smallerUsage = usage({ costMicroUsd: 1, runKey: "exec1" });
    const largerUsage = usage({ costMicroUsd: 2, runKey: "exec1" });
    const otherExecutionUsage = usage({ costMicroUsd: 1, runKey: "exec2" });
    const otherModelUsage = usage({
      costMicroUsd: 1,
      modelId: "claude-opus-4-8",
      providerId: "anthropic",
      runKey: "exec1",
    });

    const plan = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: "api",
      getUsageAllocationKey: (runUsage) =>
        runUsage === smallerUsage ? "smaller" : "larger",
      runUsages: [
        smallerUsage,
        largerUsage,
        otherExecutionUsage,
        otherModelUsage,
      ],
    });

    expect(plan.totals).toEqual({
      llmBilledCredits: 3,
      toolBilledCredits: 0,
      billedCredits: 3,
    });
    expect(plan.llm).toHaveLength(3);
    expect(plan.llm[0]?.usageAllocations).toEqual([
      { usage: smallerUsage, allocatedBilledCreditMicro: 333_333 },
      { usage: largerUsage, allocatedBilledCreditMicro: 666_667 },
    ]);
  });

  it("allocates rounding remainders by stable key instead of input order", () => {
    const usages = [
      { ...usage({ costMicroUsd: 1, runKey: "exec1" }), allocationKey: "b" },
      { ...usage({ costMicroUsd: 1, runKey: "exec1" }), allocationKey: "a" },
      { ...usage({ costMicroUsd: 1, runKey: "exec1" }), allocationKey: "c" },
    ];
    const allocations = (input: typeof usages) => {
      const plan = buildAgentMessageBillingPlan({
        actions: [],
        contextOrigin: "api",
        getUsageAllocationKey: (runUsage) => runUsage.allocationKey,
        runUsages: input,
      });

      return new Map(
        plan.llm[0]?.usageAllocations?.map(
          ({ usage: runUsage, allocatedBilledCreditMicro }) => [
            runUsage.allocationKey,
            allocatedBilledCreditMicro,
          ]
        )
      );
    };

    expect(allocations(usages)).toEqual(
      new Map([
        ["a", 333_334],
        ["b", 333_333],
        ["c", 333_333],
      ])
    );
    expect(allocations([...usages].reverse())).toEqual(allocations(usages));
  });

  it("rejects duplicate allocation keys", () => {
    const repeatedUsage = usage({ costMicroUsd: 1, runKey: "exec1" });

    expect(() =>
      buildAgentMessageBillingPlan({
        actions: [],
        contextOrigin: "api",
        getUsageAllocationKey: () => "same",
        runUsages: [repeatedUsage, repeatedUsage, repeatedUsage],
      })
    ).toThrow("Usage allocation keys must be unique within a billing group.");
  });

  it.each([
    { costMicroUsd: 8_499, expectedCredits: 1 },
    { costMicroUsd: 8_500, expectedCredits: 1 },
    { costMicroUsd: 8_501, expectedCredits: 2 },
  ])("rounds $costMicroUsd micro-dollars to $expectedCredits credit(s)", ({
    costMicroUsd,
    expectedCredits,
  }) => {
    const plan = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: "api",
      runUsages: [usage({ costMicroUsd, runKey: "exec1" })],
    });

    expect(plan.totals.llmBilledCredits).toBe(expectedCredits);
  });

  it("prices tools and returns one total across LLM and tools", () => {
    const plan = buildAgentMessageBillingPlan({
      actions: [
        {
          toolName: "websearch",
          internalMCPServerName: "web_search_&_browse",
          status: "succeeded",
        },
        {
          toolName: "custom_tool",
          internalMCPServerName: null,
          status: "succeeded",
        },
        {
          toolName: "custom_tool",
          internalMCPServerName: null,
          status: "denied",
        },
      ],
      contextOrigin: "web",
      runUsages: [usage({ costMicroUsd: 1, runKey: "exec1" })],
    });

    expect(plan.tools.map(({ billedCredits }) => billedCredits)).toEqual([
      1, 3, 0,
    ]);
    expect(
      plan.tools.map(({ billingDisposition }) => billingDisposition)
    ).toEqual(["billed", "billed", "unbillable_status"]);
    expect(plan.totals).toEqual({
      llmBilledCredits: 1,
      toolBilledCredits: 4,
      billedCredits: 5,
    });
  });

  it("keeps metered usage while making free-origin billing zero", () => {
    const plan = buildAgentMessageBillingPlan({
      actions: [
        {
          toolName: "custom_tool",
          internalMCPServerName: null,
          status: "succeeded",
        },
      ],
      contextOrigin: "agent_sidekick",
      runUsages: [usage({ costMicroUsd: 1, runKey: "exec1" })],
    });

    expect(plan.llm[0]).toMatchObject({
      ratedCredits: 1,
      billedCredits: 0,
      billingDisposition: "free_origin",
    });
    expect(plan.tools[0]).toMatchObject({
      ratedCredits: 3,
      billedCredits: 0,
      billingDisposition: "free_origin",
    });
    expect(plan.totals.billedCredits).toBe(0);
  });

  it("distinguishes free tools from unbillable statuses", () => {
    const plan = buildAgentMessageBillingPlan({
      actions: [
        {
          toolName: "create_recommendation",
          internalMCPServerName: "activation_recommendations",
          status: "succeeded",
        },
        {
          toolName: "custom_tool",
          internalMCPServerName: null,
          status: "denied",
        },
      ],
      contextOrigin: "web",
      runUsages: [],
    });

    expect(plan.tools).toEqual([
      expect.objectContaining({
        ratedCredits: 1,
        billedCredits: 0,
        billingDisposition: "free_tool",
      }),
      expect.objectContaining({
        ratedCredits: 3,
        billedCredits: 0,
        billingDisposition: "unbillable_status",
      }),
    ]);
  });
});
