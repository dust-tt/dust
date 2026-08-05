import {
  getInternalMCPServerMetadata,
  type InternalMCPServerNameType,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  isToolExecutionStatusBillable,
  type ToolExecutionStatus,
} from "@app/lib/actions/statuses";
import { TOOL_COST_CATEGORIES, type ToolCostCategory } from "@app/lib/api/mcp";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { createHash } from "crypto";

export { TOOL_COST_CATEGORIES, type ToolCostCategory } from "@app/lib/api/mcp";

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

export const LEGACY_RUN_KEY = "__legacy__";

export const FREE_ORIGINS: ReadonlySet<UserMessageOrigin> =
  new Set<UserMessageOrigin>([
    "agent_sidekick",
    // Only the Activation Pod nudge ever carries this origin: it is server-only,
    // and the nudge has no author so it can neither be edited nor retried. User
    // replies come back as `web` and bill normally.
    "system_activation",
  ]);

export const TOOL_COST_CATEGORY_AWU_WEIGHTS: Record<ToolCostCategory, number> =
  {
    basic: 1,
    advanced: 3,
  };

export type AgentMessageBillingRunUsage = RunUsageType & {
  runKey: string | null;
};

export type AgentMessageBillingAction = {
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
  toolName: string;
};

export type AgentMessageLlmBillingLine<
  TUsage extends AgentMessageBillingRunUsage,
> = {
  billingGroupKey: string;
  runKey: string;
  providerId: TUsage["providerId"];
  modelId: TUsage["modelId"];
  promptTokensCount: number;
  completionTokensCount: number;
  cachedTokensCount: number;
  cacheCreationTokensCount: number;
  providerCostMicroUsd: number;
  ratedCredits: number;
  billedCredits: number;
  disposition: "billed" | "free_origin";
  usageAllocations: Array<{
    usage: TUsage;
    allocatedBilledCreditMicro: number;
  }> | null;
};

export type AgentMessageToolBillingLine<
  TAction extends AgentMessageBillingAction,
> = {
  action: TAction;
  toolCostCategory: ToolCostCategory;
  freeUsage: boolean;
  ratedCredits: number;
  billedCredits: number;
  disposition: "billed" | "free_origin" | "free_tool" | "unbillable_status";
};

export type AgentMessageBillingPlan<
  TUsage extends AgentMessageBillingRunUsage,
  TAction extends AgentMessageBillingAction,
> = {
  llm: AgentMessageLlmBillingLine<TUsage>[];
  tools: AgentMessageToolBillingLine<TAction>[];
  totals: {
    llmBilledCredits: number;
    toolBilledCredits: number;
    billedCredits: number;
  };
};

export function isFreeOrigin(origin: UserMessageOrigin | null): boolean {
  return origin !== null && FREE_ORIGINS.has(origin);
}

export function computeRunKey(dustRunIds: string[]): string {
  return createHash("sha256")
    .update([...dustRunIds].sort().join(","))
    .digest("hex")
    .slice(0, 8);
}

export function awuFromMicroUsd(microUsd: number): number {
  return Math.ceil(microUsd / MODEL_COST_MICRO_USD_PER_AWU_CREDIT);
}

export function isToolCostCategory(value: string): value is ToolCostCategory {
  return TOOL_COST_CATEGORIES.some((category) => category === value);
}

export function getToolBillingInfo(
  serverName: string | null,
  toolName: string
): { toolCostCategory: ToolCostCategory; freeUsage: boolean } {
  if (!serverName || !isInternalMCPServerName(serverName)) {
    return { toolCostCategory: "advanced", freeUsage: false };
  }

  const metadata = getInternalMCPServerMetadata(serverName);
  const tool = metadata.tools.find((candidate) => candidate.name === toolName);
  if (!tool) {
    return { toolCostCategory: "advanced", freeUsage: false };
  }

  return {
    toolCostCategory: tool.toolCostCategory,
    freeUsage: tool.freeUsage,
  };
}

function allocateBilledCreditMicro<TUsage extends AgentMessageBillingRunUsage>({
  billedCredits,
  getUsageAllocationKey,
  providerCostMicroUsd,
  usages,
}: {
  billedCredits: number;
  getUsageAllocationKey: (usage: TUsage) => string;
  providerCostMicroUsd: number;
  usages: TUsage[];
}): AgentMessageLlmBillingLine<TUsage>["usageAllocations"] {
  const billedCreditMicro = billedCredits * MICRO_CREDITS_PER_CREDIT;
  if (providerCostMicroUsd === 0) {
    return usages.map((usage) => ({
      usage,
      allocatedBilledCreditMicro: 0,
    }));
  }

  const allocations = usages.map((usage) => {
    const allocationKey = getUsageAllocationKey(usage);
    const exactCreditMicro =
      (usage.costMicroUsd / providerCostMicroUsd) * billedCreditMicro;
    const floorCreditMicro = Math.floor(exactCreditMicro);

    return {
      usage,
      allocationKey,
      floorCreditMicro,
      fractionalCreditMicro: exactCreditMicro - floorCreditMicro,
    };
  });
  if (
    new Set(allocations.map(({ allocationKey }) => allocationKey)).size !==
    allocations.length
  ) {
    throw new Error(
      "Usage allocation keys must be unique within a billing group."
    );
  }
  const allocatedFloorCreditMicro = allocations.reduce(
    (total, allocation) => total + allocation.floorCreditMicro,
    0
  );
  const remainderCreditMicro = billedCreditMicro - allocatedFloorCreditMicro;
  const allocationKeysReceivingRemainder = new Set(
    [...allocations]
      .sort(
        (left, right) =>
          right.fractionalCreditMicro - left.fractionalCreditMicro ||
          (left.allocationKey < right.allocationKey ? -1 : 1)
      )
      .slice(0, remainderCreditMicro)
      .map(({ allocationKey }) => allocationKey)
  );

  return allocations.map(({ usage, allocationKey, floorCreditMicro }) => ({
    usage,
    allocatedBilledCreditMicro:
      floorCreditMicro +
      (allocationKeysReceivingRemainder.has(allocationKey) ? 1 : 0),
  }));
}

/**
 * Produces the canonical billing plan for one agent message.
 *
 * LLM usage is billed once per (execution, provider, model). Tool actions are billed independently.
 * Callers should project this plan instead of rebuilding grouping, free-usage, rounding, or tool-pricing rules.
 */
export function buildAgentMessageBillingPlan<
  TUsage extends AgentMessageBillingRunUsage,
  TAction extends AgentMessageBillingAction,
>({
  actions,
  contextOrigin,
  getUsageAllocationKey,
  runUsages,
}: {
  actions: TAction[];
  contextOrigin: UserMessageOrigin | null;
  getUsageAllocationKey?: (usage: TUsage) => string;
  runUsages: TUsage[];
}): AgentMessageBillingPlan<TUsage, TAction> {
  const isMessageFree = isFreeOrigin(contextOrigin);
  const usagesByBillingGroup = new Map<
    string,
    {
      billingGroupKey: string;
      runKey: string;
      providerId: TUsage["providerId"];
      modelId: TUsage["modelId"];
      usages: TUsage[];
    }
  >();

  for (const usage of runUsages) {
    const runKey = usage.runKey ?? LEGACY_RUN_KEY;
    const billingGroupKey = `${runKey}|${usage.providerId}|${usage.modelId}`;
    const group = usagesByBillingGroup.get(billingGroupKey);
    if (group) {
      group.usages.push(usage);
    } else {
      usagesByBillingGroup.set(billingGroupKey, {
        billingGroupKey,
        runKey,
        providerId: usage.providerId,
        modelId: usage.modelId,
        usages: [usage],
      });
    }
  }

  const llm = [...usagesByBillingGroup.values()].map(
    ({ billingGroupKey, runKey, providerId, modelId, usages }) => {
      const promptTokensCount = usages.reduce(
        (total, usage) => total + usage.promptTokens,
        0
      );
      const completionTokensCount = usages.reduce(
        (total, usage) => total + usage.completionTokens,
        0
      );
      const cachedTokensCount = usages.reduce(
        (total, usage) => total + (usage.cachedTokens ?? 0),
        0
      );
      const cacheCreationTokensCount = usages.reduce(
        (total, usage) => total + (usage.cacheCreationTokens ?? 0),
        0
      );
      const providerCostMicroUsd = usages.reduce(
        (total, usage) => total + usage.costMicroUsd,
        0
      );
      const ratedCredits = awuFromMicroUsd(providerCostMicroUsd);
      const billedCredits = isMessageFree ? 0 : ratedCredits;
      const disposition: AgentMessageLlmBillingLine<TUsage>["disposition"] =
        isMessageFree ? "free_origin" : "billed";

      return {
        billingGroupKey,
        runKey,
        providerId,
        modelId,
        promptTokensCount,
        completionTokensCount,
        cachedTokensCount,
        cacheCreationTokensCount,
        providerCostMicroUsd,
        ratedCredits,
        billedCredits,
        disposition,
        usageAllocations: getUsageAllocationKey
          ? allocateBilledCreditMicro({
              billedCredits,
              getUsageAllocationKey,
              providerCostMicroUsd,
              usages,
            })
          : null,
      };
    }
  );

  const tools = actions.map((action) => {
    const { toolCostCategory, freeUsage } = getToolBillingInfo(
      action.internalMCPServerName,
      action.toolName
    );
    const disposition: AgentMessageToolBillingLine<TAction>["disposition"] =
      !isToolExecutionStatusBillable(action.status)
        ? "unbillable_status"
        : isMessageFree
          ? "free_origin"
          : freeUsage
            ? "free_tool"
            : "billed";
    const ratedCredits = TOOL_COST_CATEGORY_AWU_WEIGHTS[toolCostCategory];
    const billedCredits = disposition === "billed" ? ratedCredits : 0;

    return {
      action,
      toolCostCategory,
      freeUsage,
      ratedCredits,
      billedCredits,
      disposition,
    };
  });

  const llmBilledCredits = llm.reduce(
    (total, line) => total + line.billedCredits,
    0
  );
  const toolBilledCredits = tools.reduce(
    (total, line) => total + line.billedCredits,
    0
  );

  return {
    llm,
    tools,
    totals: {
      llmBilledCredits,
      toolBilledCredits,
      billedCredits: llmBilledCredits + toolBilledCredits,
    },
  };
}
