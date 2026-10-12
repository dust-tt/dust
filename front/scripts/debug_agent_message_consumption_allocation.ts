/**
 * Explains how an agent message's bill is reconciled across its consumption items, step by step,
 * or where the reconciliation fails. Compares the tokenizer estimates of tool footprints with what
 * the provider reported, and ends with a diagnosis listing every anomaly found.
 *
 * This script is read-only and never logs tool result contents. `--compareOpenAI` and
 * `--compareGemini` send the rendered tool results to the provider's token-count endpoint.
 *
 * npx tsx scripts/debug_agent_message_consumption_allocation.ts \
 *   --workspaceId 8DpNy5tEUG \
 *   --agentMessageId Ut5LbnRe3M \
 *   --execute
 */

import { TOOL_OUTPUT_OFFLOAD_META_KEY } from "@app/lib/actions/action_output_limits";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import {
  allocateUsageCredits,
  buildLatestMessageConsumptionAllocation,
  compareRunsChronologically,
  groupToolResultsByReadingUsage,
  toolResultShareOfInputCost,
  usageCostPartPayingFor,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  getCachedTokenPriceRatios,
  splitRecordedCostIntoInputAndOutput,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { getEnabledSkillInputTextByActionId } from "@app/lib/api/assistant/agent_message_consumption_attribution/enabled_skill_footprint";
import {
  measureToolCallFootprints,
  toolCallFootprintTexts,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { Authenticator } from "@app/lib/auth";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import {
  MICRO_CREDITS_PER_CREDIT,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { trustedFetch } from "@app/lib/egress/server";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { MODEL_COST_MICRO_USD_PER_AWU_CREDIT } from "@app/lib/metronome/constants";
import {
  OPENAI_EU_BASE_URL,
  OPENAI_GLOBAL_BASE_URL,
} from "@app/lib/model_constructors/providers/openai/base_url";
import { isToolSearchEnabledForModel } from "@app/lib/model_constructors/types/tool_search";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type {
  RunUsageAttemptWithRunType,
  RunUsageWithRunKeyType,
} from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import {
  getTemporalClientForAgentNamespace,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { makeScript } from "@app/scripts/helpers";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { ModelId } from "@app/types/shared/model_id";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { TiktokenTokenizerBase } from "@app/types/tokenizer";
import { GoogleGenAI } from "@google/genai";
import { tsToDate } from "@temporalio/common";
import { z } from "zod";

const MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS = 1_024;

// The observed growth of the reading call's prompt also carries message framing, so a lower bound
// tolerates a larger gap than an upper bound.
const TOKENIZER_OVERESTIMATE_RATIO = 1.2;
const TOKENIZER_UNDERESTIMATE_RATIO = 0.7;
const MIN_TOKENIZER_GAP_TOKENS = 100;

const ALTERNATIVE_TOKENIZER_BASES = [
  "o200k_base",
  "cl100k_base",
  "anthropic_base",
] as const satisfies TiktokenTokenizerBase[];

type Finding = {
  flag: string;
  detail: string;
};

type ToolEvidenceGap =
  | "ok"
  | "not_checked_no_run"
  | "not_checked_run_without_usage"
  | "missing_item"
  | "pending_item_for_final_action";

type TokenizerVerdict =
  | "consistent"
  | "prompt_did_not_grow"
  | "tokenizer_overestimates"
  | "tokenizer_underestimates";

const OpenAIInputTokenCountResponseSchema = z.object({
  input_tokens: z.number().int().nonnegative(),
});

function credits(creditMicro: number | null | undefined): number | "n/a" {
  return creditMicro === null || creditMicro === undefined
    ? "n/a"
    : Math.round(creditMicro) / MICRO_CREDITS_PER_CREDIT;
}

function creditMicroFromCostMicroUsd(costMicroUsd: number): number {
  return (
    (costMicroUsd * MICRO_CREDITS_PER_CREDIT) /
    MODEL_COST_MICRO_USD_PER_AWU_CREDIT
  );
}

function sumCreditMicro(
  items: AgentMessageConsumptionItemResource[],
  creditMicroOf: (item: AgentMessageConsumptionItemResource) => number
): number {
  return items.reduce((total, item) => total + creditMicroOf(item), 0);
}

function ratio(numerator: number, denominator: number): number | "n/a" {
  return denominator > 0
    ? Math.round((numerator / denominator) * 100) / 100
    : "n/a";
}

/** Mirrors `toolResultShareOfInputCost`: tool results sit at the end of the reading call's prompt. */
function toolResultTokensByPromptSegment(
  usage: RunUsageWithRunKeyType,
  toolResultTokensCount: number
) {
  const cachedTokens = Math.min(usage.cachedTokens ?? 0, usage.promptTokens);
  const cacheWriteTokens = Math.min(
    usage.cacheCreationTokens ?? 0,
    usage.promptTokens - cachedTokens
  );
  const freshTokens = usage.promptTokens - cachedTokens - cacheWriteTokens;
  const inFreshTokens = Math.min(toolResultTokensCount, freshTokens);
  const inCacheWriteTokens = Math.min(
    toolResultTokensCount - inFreshTokens,
    cacheWriteTokens
  );
  const inCachedTokens = Math.min(
    toolResultTokensCount - inFreshTokens - inCacheWriteTokens,
    cachedTokens
  );
  return {
    uncachedTokens: freshTokens + cacheWriteTokens,
    inFreshTokens,
    inCacheWriteTokens,
    inCachedTokens,
    beyondPromptTokens: Math.max(toolResultTokensCount - usage.promptTokens, 0),
  };
}

function tokenizerVerdict({
  estimatedTokens,
  observedMinTokens,
  observedMaxTokens,
}: {
  estimatedTokens: number;
  observedMinTokens: number;
  observedMaxTokens: number;
}): TokenizerVerdict {
  if (observedMaxTokens <= 0) {
    return "prompt_did_not_grow";
  }
  if (
    estimatedTokens > observedMaxTokens * TOKENIZER_OVERESTIMATE_RATIO &&
    estimatedTokens - observedMaxTokens > MIN_TOKENIZER_GAP_TOKENS
  ) {
    return "tokenizer_overestimates";
  }
  if (
    estimatedTokens < observedMinTokens * TOKENIZER_UNDERESTIMATE_RATIO &&
    observedMinTokens - estimatedTokens > MIN_TOKENIZER_GAP_TOKENS
  ) {
    return "tokenizer_underestimates";
  }
  return "consistent";
}

function countOffloadedBlocks(action: AgentMCPActionWithOutputType): number {
  return (action.output ?? []).filter((block) => {
    const metadata = "_meta" in block ? block._meta : undefined;
    return metadata?.[TOOL_OUTPUT_OFFLOAD_META_KEY] !== undefined;
  }).length;
}

function openAIBaseUrl(credentials: {
  OPENAI_BASE_URL?: string;
  OPENAI_USE_EU_ENDPOINT?: string;
}): string {
  if (credentials.OPENAI_BASE_URL) {
    return credentials.OPENAI_BASE_URL;
  }
  return credentials.OPENAI_USE_EU_ENDPOINT === "true"
    ? OPENAI_EU_BASE_URL
    : OPENAI_GLOBAL_BASE_URL;
}

async function countOpenAIInputTokens({
  apiKey,
  baseUrl,
  input,
  modelId,
}: {
  apiKey: string;
  baseUrl: string;
  input: string;
  modelId: string;
}): Promise<number> {
  const endpoint = new URL(
    "responses/input_tokens",
    `${baseUrl.replace(/\/$/, "")}/`
  );
  const response = await trustedFetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: modelId, input }),
  });
  if (!response.ok) {
    throw new Error(
      `OpenAI input-token count failed for ${modelId} with HTTP ${response.status}.`
    );
  }

  return OpenAIInputTokenCountResponseSchema.parse(await response.json())
    .input_tokens;
}

async function countGeminiInputTokens({
  client,
  input,
  modelId,
}: {
  client: GoogleGenAI;
  input: string;
  modelId: string;
}): Promise<number> {
  const response = await client.models.countTokens({
    model: modelId,
    contents: input,
  });
  if (response.totalTokens === undefined) {
    throw new Error(
      `Gemini input-token count returned no total for ${modelId}.`
    );
  }

  return response.totalTokens;
}

async function printAttributionWorkflowHistory(message: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<Finding[]> {
  const workflowId = `${makeAgentMessageAnalyticsWorkflowId(message)}-consumption-attribution-v3`;

  try {
    const client = await getTemporalClientForFrontNamespace();
    const executionRows: Array<Record<string, unknown>> = [];
    const eventRows: Array<Record<string, unknown>> = [];
    let failedActivities = 0;

    for await (const execution of client.workflow.list({
      query: `WorkflowId = ${JSON.stringify(workflowId)}`,
    })) {
      const handle = client.workflow.getHandle(workflowId, execution.runId);
      const [description, history] = await Promise.all([
        handle.describe(),
        handle.fetchHistory(),
      ]);
      const activityByScheduledEventId = new Map<string, string>();

      for (const event of history.events ?? []) {
        const eventAt = event.eventTime
          ? tsToDate(event.eventTime).toISOString()
          : "n/a";
        const signal = event.workflowExecutionSignaledEventAttributes;
        if (signal) {
          eventRows.push({
            runId: execution.runId,
            eventAt,
            event: "signal",
            detail: signal.signalName ?? "unknown",
          });
        }

        const scheduled = event.activityTaskScheduledEventAttributes;
        if (scheduled) {
          const activity = scheduled.activityType?.name ?? "unknown";
          activityByScheduledEventId.set(String(event.eventId), activity);
          eventRows.push({
            runId: execution.runId,
            eventAt,
            event: "activity_scheduled",
            detail: activity,
          });
        }

        const outcome =
          event.activityTaskCompletedEventAttributes ??
          event.activityTaskFailedEventAttributes ??
          event.activityTaskTimedOutEventAttributes ??
          event.activityTaskCanceledEventAttributes;
        if (outcome) {
          const activity =
            activityByScheduledEventId.get(String(outcome.scheduledEventId)) ??
            "unknown";
          const failure = event.activityTaskFailedEventAttributes?.failure;
          if (!event.activityTaskCompletedEventAttributes) {
            failedActivities++;
          }
          eventRows.push({
            runId: execution.runId,
            eventAt,
            event: event.activityTaskCompletedEventAttributes
              ? "activity_completed"
              : event.activityTaskFailedEventAttributes
                ? "activity_failed"
                : event.activityTaskTimedOutEventAttributes
                  ? "activity_timed_out"
                  : "activity_canceled",
            detail: failure?.message
              ? `${activity}: ${failure.message}`
              : activity,
          });
        }
      }

      const pendingActivity = description.raw.pendingActivities?.[0];
      executionRows.push({
        runId: execution.runId,
        status: execution.status.name,
        startTime: execution.startTime.toISOString(),
        closeTime: execution.closeTime?.toISOString() ?? "running",
        pendingActivity: pendingActivity?.activityType?.name ?? "none",
        pendingAttempt: pendingActivity?.attempt ?? "none",
        pendingFailure: pendingActivity?.lastFailure?.message || "none",
      });
    }

    console.log(`\nAttribution workflow executions (${workflowId})`);
    console.table(executionRows);
    console.log("\nAttribution workflow events");
    console.table(eventRows);

    const findings: Finding[] = [];
    if (executionRows.length === 0) {
      findings.push({
        flag: "attribution_workflow_not_found",
        detail: `No execution of ${workflowId}: attribution never ran or its history expired.`,
      });
    }
    const pendingFailures = executionRows.filter(
      (row) => row.pendingFailure !== "none"
    );
    if (failedActivities > 0 || pendingFailures.length > 0) {
      findings.push({
        flag: "attribution_workflow_failing",
        detail:
          `${failedActivities} activities failed or timed out, ` +
          `${pendingFailures.length} executions retry a failing activity. See the workflow events.`,
      });
    }
    return findings;
  } catch (error) {
    const { message: errorMessage } = normalizeError(error);
    console.log("\nAttribution workflow history unavailable");
    console.table([{ workflowId, error: errorMessage }]);
    return [{ flag: "temporal_unavailable", detail: errorMessage }];
  }
}

async function printAgentLoopModelActivityAttempts(message: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<Finding[]> {
  const workflowId = makeAgentLoopWorkflowId(message);

  try {
    const client = await getTemporalClientForAgentNamespace();
    const history = await client.workflow.getHandle(workflowId).fetchHistory();
    const activityByScheduledEventId = new Map<string, string>();
    const rows: Array<Record<string, unknown>> = [];
    let retriedAttempts = 0;

    for (const event of history.events ?? []) {
      const eventAt = event.eventTime
        ? tsToDate(event.eventTime).toISOString()
        : "n/a";
      const scheduled = event.activityTaskScheduledEventAttributes;
      if (scheduled) {
        activityByScheduledEventId.set(
          String(event.eventId),
          scheduled.activityType?.name ?? "unknown"
        );
      }

      const started = event.activityTaskStartedEventAttributes;
      if (
        started &&
        activityByScheduledEventId.get(String(started.scheduledEventId)) ===
          "runModelAndCreateActionsActivity"
      ) {
        const attempt = started.attempt ?? 1;
        if (attempt > 1) {
          retriedAttempts++;
        }
        rows.push({ eventAt, event: "started", attempt });
      }

      const outcome =
        event.activityTaskCompletedEventAttributes ??
        event.activityTaskFailedEventAttributes ??
        event.activityTaskTimedOutEventAttributes ??
        event.activityTaskCanceledEventAttributes;
      if (
        outcome &&
        activityByScheduledEventId.get(String(outcome.scheduledEventId)) ===
          "runModelAndCreateActionsActivity"
      ) {
        rows.push({
          eventAt,
          event: event.activityTaskCompletedEventAttributes
            ? "completed"
            : event.activityTaskFailedEventAttributes
              ? "failed"
              : event.activityTaskTimedOutEventAttributes
                ? "timed_out"
                : "canceled",
          attempt: "n/a",
        });
      }
    }

    console.log("\nAgent loop: runModelAndCreateActionsActivity attempts");
    console.table(rows);
    return retriedAttempts > 0
      ? [
          {
            flag: "model_activity_retried",
            detail: `${retriedAttempts} model activity attempts were retries; each may have reported its own usage.`,
          },
        ]
      : [];
  } catch (error) {
    const { message: errorMessage } = normalizeError(error);
    console.log("\nAgent loop history unavailable");
    console.table([{ workflowId, error: errorMessage }]);
    return [{ flag: "temporal_unavailable", detail: errorMessage }];
  }
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    agentMessageId: {
      type: "string",
      demandOption: true,
      description: "Agent message sId.",
    },
    compareOpenAI: {
      type: "boolean",
      default: false,
      description:
        "Send rendered tool results to OpenAI's input-token count endpoint; its count includes request framing.",
    },
    compareGemini: {
      type: "boolean",
      default: false,
      description:
        "Send rendered tool results to Gemini's countTokens endpoint; its count includes request framing.",
    },
  },
  async ({
    agentMessageId,
    compareGemini,
    compareOpenAI,
    execute,
    workspaceId,
  }) => {
    if (!execute) {
      console.log("Read-only diagnostic. Pass --execute to run it.");
      return;
    }

    const findings: Finding[] = [];

    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      throw new Error(`Agent message ${agentMessageId} was not found.`);
    }
    const analyticsContext =
      await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
        auth,
        { agentMessageId }
      );
    if (!analyticsContext) {
      throw new Error(
        `Agent message ${agentMessageId} has no consumption analytics context.`
      );
    }
    const { conversationId } = analyticsContext.conversation;
    const conversation = await ConversationResource.fetchById(
      auth,
      conversationId,
      { dangerouslySkipPermissionFiltering: true, includeDeleted: true }
    );
    if (!conversation) {
      throw new Error(`Conversation ${conversationId} was not found.`);
    }
    const capabilities = await getAttachmentCapabilityContext(
      auth,
      conversation
    );

    const billedCredits = creditContext.previousCostCredits;
    const dustRunIds = [...new Set(creditContext.runIds ?? [])];
    const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
    const [usages, attempts, actions, items] = await Promise.all([
      RunResource.listRunUsagesForRuns(auth, { runs }),
      RunResource.listRunUsageAttemptsForRuns(auth, { runs }),
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [creditContext.agentMessageModelId],
        maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
    ]);

    const allocationResult = buildLatestMessageConsumptionAllocation({
      actions,
      billedCredits,
      dustRunIds,
      hasUnbilledExecution: false,
      items,
      runs,
      usages,
    });
    if (allocationResult.isErr()) {
      findings.push({
        flag: allocationResult.error.code,
        detail: "Reconciliation failed; the findings below explain why.",
      });
    }

    console.log("\nResult");
    console.table([
      {
        agentMessageId,
        conversationId,
        status: creditContext.status,
        completedAt:
          analyticsContext.agentMessage.completedAt?.toISOString() ?? "none",
        origin: creditContext.triggeringUserMessageOrigin ?? "none",
        billedCredits: billedCredits ?? "none",
        result: allocationResult.isOk()
          ? "reconciled"
          : allocationResult.error.code,
        attributionVersion: allocationResult.isOk()
          ? allocationResult.value.attributionVersion
          : "n/a",
        ...(allocationResult.isErr() ? allocationResult.error.context : {}),
      },
    ]);

    const attributionVersions = [
      ...new Set(items.map(({ attributionVersion }) => attributionVersion)),
    ].sort((left, right) => right - left);
    console.log("\nStored attribution versions, newest first");
    console.table(
      attributionVersions.map((attributionVersion) => {
        const versionItems = items.filter(
          (item) => item.attributionVersion === attributionVersion
        );
        const versionResult = buildLatestMessageConsumptionAllocation({
          actions,
          billedCredits,
          dustRunIds,
          hasUnbilledExecution: false,
          items: versionItems,
          runs,
          usages,
        });
        return {
          attributionVersion,
          items: versionItems.length,
          result: versionResult.isOk()
            ? "reconciled"
            : versionResult.error.code,
        };
      })
    );
    if (
      attributionVersions[0] !== AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
    ) {
      findings.push({
        flag: "no_current_version_items",
        detail: `No items at version ${AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION}; the attribution workflow has not run since the last version bump.`,
      });
    }

    const reportedItems = allocationResult.isOk()
      ? allocationResult.value.items
      : items.filter(
          (item) => item.attributionVersion === attributionVersions[0]
        );
    const reconciledCreditMicroByItem = allocationResult.isOk()
      ? allocationResult.value.reconciledCreditAmounts.byItem
      : null;

    const runByModelId = new Map(runs.map((run) => [run.id, run]));
    const orderedRuns = [...runs].sort(compareRunsChronologically);
    const runIndexByModelId = new Map(
      orderedRuns.map((run, index) => [run.id, index])
    );
    const orderedUsages = [...usages].sort(
      (left, right) =>
        (runIndexByModelId.get(left.runModelId) ?? -1) -
          (runIndexByModelId.get(right.runModelId) ?? -1) ||
        left.runModelId - right.runModelId ||
        left.runUsageModelId - right.runUsageModelId
    );
    const usageNumberByRunUsageModelId = new Map(
      orderedUsages.map((usage, index) => [usage.runUsageModelId, index + 1])
    );
    const itemsByRunUsageModelId = new Map<
      ModelId,
      AgentMessageConsumptionItemResource[]
    >();
    for (const item of reportedItems) {
      const usageItems = itemsByRunUsageModelId.get(item.runUsageId) ?? [];
      usageItems.push(item);
      itemsByRunUsageModelId.set(item.runUsageId, usageItems);
    }
    const toolItemByActionModelId = new Map(
      reportedItems.flatMap((item) =>
        item.itemType === "tool" && item.agentMCPActionId !== null
          ? [[item.agentMCPActionId, item] as const]
          : []
      )
    );
    const actionSIdByModelId = new Map(
      actions.map((action) => [action.id, action.sId])
    );

    const modelEvidenceRows = orderedUsages.map((usage) => {
      const itemTypes = new Set(
        (itemsByRunUsageModelId.get(usage.runUsageModelId) ?? []).map(
          ({ itemType }) => itemType
        )
      );
      const needsReasoning = usage.reasoningTokens !== null;
      return {
        usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
        runUsageId: usage.runUsageModelId,
        input: itemTypes.has("input"),
        output: itemTypes.has("output"),
        reasoning: needsReasoning ? itemTypes.has("reasoning") : "not_needed",
        complete:
          itemTypes.has("input") &&
          itemTypes.has("output") &&
          (!needsReasoning || itemTypes.has("reasoning")),
      };
    });
    console.log(
      "\nEvidence: every usage needs input, output and, when reported, reasoning items"
    );
    console.table(modelEvidenceRows);
    const usagesMissingModelItems = modelEvidenceRows.filter(
      ({ complete }) => !complete
    );
    if (usagesMissingModelItems.length > 0) {
      findings.push({
        flag: "usage_missing_model_items",
        detail: `Usages ${usagesMissingModelItems.map(({ usage }) => usage).join(", ")} have no complete model items: attribution has not processed them.`,
      });
    }

    const dustRunIdsWithUsage = new Set(
      usages.flatMap((usage) => {
        const run = runByModelId.get(usage.runModelId);
        return run ? [run.dustRunId] : [];
      })
    );
    const toolEvidenceRows = actions.map((action) => {
      const dustRunId = action.stepContent.dustRunId;
      const item = toolItemByActionModelId.get(action.id);
      let gap: ToolEvidenceGap = "ok";
      if (!dustRunId) {
        gap = "not_checked_no_run";
      } else if (!dustRunIdsWithUsage.has(dustRunId)) {
        gap = "not_checked_run_without_usage";
      } else if (!item) {
        gap = "missing_item";
      } else if (
        item.completedAt === null &&
        isToolExecutionStatusFinal(action.status)
      ) {
        gap = "pending_item_for_final_action";
      }
      return {
        action: action.sId,
        tool: action.toolName,
        status: action.status,
        sandboxChild: isSandboxChildActionInfo(
          action.stepContext.sandboxChildActionInfo
        ),
        createdAt: action.createdAt.toISOString(),
        updatedAt: action.updatedAt.toISOString(),
        item: item
          ? item.completedAt === null
            ? "pending"
            : "complete"
          : "none",
        gap,
      };
    });
    const itemsWithoutAction = reportedItems.filter(
      (item) =>
        item.itemType === "tool" &&
        item.agentMCPActionId !== null &&
        !actionSIdByModelId.has(item.agentMCPActionId)
    );
    console.log(
      `\nEvidence: every tool call of a run with usage needs a tool item ` +
        `(${toolEvidenceRows.filter(({ gap }) => gap === "ok").length}/${actions.length} actions ok, ` +
        `${itemsWithoutAction.length} items without action)`
    );
    const toolEvidenceGapRows = toolEvidenceRows.filter(
      ({ gap }) => gap !== "ok"
    );
    if (toolEvidenceGapRows.length > 0) {
      console.table(toolEvidenceGapRows);
    }
    const blockingToolGaps = toolEvidenceGapRows.filter(
      ({ gap }) =>
        gap === "missing_item" || gap === "pending_item_for_final_action"
    );
    if (blockingToolGaps.length > 0 || itemsWithoutAction.length > 0) {
      findings.push({
        flag: "tool_evidence_gap",
        detail:
          `${blockingToolGaps.filter(({ gap }) => gap === "missing_item").length} actions without item, ` +
          `${blockingToolGaps.filter(({ gap }) => gap === "pending_item_for_final_action").length} final actions with a pending item, ` +
          `${itemsWithoutAction.length} items whose action is not on the message.`,
      });
    }

    const toolFeesCreditMicro = sumCreditMicro(
      reportedItems,
      (item) => item.directCreditAmountMicro ?? 0
    );
    const llmBillingPlan = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: null,
      getUsageAllocationKey: (usage) => String(usage.runUsageModelId),
      runUsages: usages,
    });
    const chargedLlmBilledCredits = buildAgentMessageBillingPlan({
      actions: [],
      contextOrigin: creditContext.triggeringUserMessageOrigin,
      runUsages: usages,
    }).totals.llmBilledCredits;
    const llmBilledCreditMicro =
      billedCredits === null
        ? null
        : roundCreditsToMicroCredits(billedCredits) - toolFeesCreditMicro;
    const recomputedLlmBilledCreditMicro = roundCreditsToMicroCredits(
      llmBillingPlan.totals.llmBilledCredits
    );
    const llmBillGapCreditMicro =
      llmBilledCreditMicro === null
        ? null
        : llmBilledCreditMicro - recomputedLlmBilledCreditMicro;

    console.log("\nStep 1: the LLM part of the bill must match its usages");
    console.table([
      {
        quantity: "bill",
        credits: billedCredits ?? "n/a",
        meaning: "What the message was charged",
      },
      {
        quantity: "tool_fees",
        credits: credits(toolFeesCreditMicro),
        meaning: "Direct credits of the tool items, kept as billed",
      },
      {
        quantity: "llm_bill",
        credits: credits(llmBilledCreditMicro),
        meaning: "Bill minus tool fees, to split across the LLM usages",
      },
      {
        quantity: "llm_bill_from_usages",
        credits: credits(recomputedLlmBilledCreditMicro),
        meaning:
          "Recorded cost of each billing group rounded up, before any free-origin waiver",
      },
      {
        quantity: "llm_bill_charged_from_usages",
        credits: chargedLlmBilledCredits,
        meaning: "Same, after the free-origin waiver (0 for free origins)",
      },
      {
        quantity: "llm_bill_gap",
        credits: credits(llmBillGapCreditMicro),
        meaning: "llm_bill minus llm_bill_from_usages, must be 0",
      },
    ]);
    if (llmBillGapCreditMicro !== null && llmBillGapCreditMicro !== 0) {
      findings.push({
        flag: "llm_bill_gap",
        detail:
          `The bill minus tool fees is ${credits(llmBillGapCreditMicro)} credits away from the usages' cost. ` +
          (chargedLlmBilledCredits === 0 &&
          llmBillingPlan.totals.llmBilledCredits > 0
            ? "The origin is free, so the LLM cost was waived. "
            : "") +
          "Compare the run usage attempts and the tool fees below with what was billed.",
      });
    }

    const toolBillingPlan = buildAgentMessageBillingPlan({
      actions: actions.map((actionResource) => ({
        actionResource,
        internalMCPServerName: actionResource.metadata.internalMCPServerName,
        mcpServerId: actionResource.metadata.mcpServerId ?? null,
        status: actionResource.status,
        toolName: actionResource.toolName,
      })),
      contextOrigin: creditContext.triggeringUserMessageOrigin,
      runUsages: [],
    });
    const plannedToolFeeByActionModelId = new Map(
      toolBillingPlan.tools.map(
        ({ action, billedCredits: toolBilledCredits, billingDisposition }) => [
          action.actionResource.id,
          {
            creditMicro: roundCreditsToMicroCredits(toolBilledCredits),
            billingDisposition,
          },
        ]
      )
    );
    const toolFeeRows = reportedItems.flatMap((item) => {
      if (item.itemType !== "tool" || item.agentMCPActionId === null) {
        return [];
      }
      const planned = plannedToolFeeByActionModelId.get(item.agentMCPActionId);
      const storedCreditMicro = item.directCreditAmountMicro ?? 0;
      const plannedCreditMicro = planned?.creditMicro ?? 0;
      if (storedCreditMicro === 0 && plannedCreditMicro === 0) {
        return [];
      }
      return [
        {
          action: actionSIdByModelId.get(item.agentMCPActionId) ?? "n/a",
          item: item.completedAt === null ? "pending" : "complete",
          storedFeeCredits: credits(item.directCreditAmountMicro),
          billingPlanFeeCredits: credits(planned?.creditMicro),
          disposition: planned?.billingDisposition ?? "no_billing_line",
          matches: storedCreditMicro === plannedCreditMicro,
        },
      ];
    });
    console.log("\nTool fees: stored on the items vs the billing plan");
    console.table(toolFeeRows);
    const mismatchedToolFees = toolFeeRows.filter(({ matches }) => !matches);
    if (mismatchedToolFees.length > 0) {
      findings.push({
        flag: "tool_fee_differs_from_billing_plan",
        detail: `Actions ${mismatchedToolFees.map(({ action }) => action).join(", ")} store a fee the billing plan would not charge today.`,
      });
    }

    console.log("\nStep 2: each billing group's bill is shared by its usages");
    console.table(
      llmBillingPlan.llm.map((line) => {
        const costCreditMicro = creditMicroFromCostMicroUsd(
          line.providerCostMicroUsd
        );
        const billedCreditMicro = roundCreditsToMicroCredits(
          line.billedCredits
        );
        return {
          runKey: line.runKey,
          provider: line.providerId,
          model: line.modelId,
          usages: line.usageAllocations?.length ?? 0,
          recordedCostCredits: credits(costCreditMicro),
          billedCredits: credits(billedCreditMicro),
          roundingCredits: credits(billedCreditMicro - costCreditMicro),
        };
      })
    );

    const usageBilledCreditMicroByRunUsageModelId = new Map(
      llmBillingPlan.llm.flatMap((line) =>
        (line.usageAllocations ?? []).map(
          ({ usage, allocatedBilledCreditMicro }) =>
            [usage.runUsageModelId, allocatedBilledCreditMicro] as const
        )
      )
    );
    const toolResultsByReadingUsage = groupToolResultsByReadingUsage({
      items: reportedItems,
      runs,
      usages,
    });
    const readingRunUsageModelIdByItem = new Map<
      AgentMessageConsumptionItemResource,
      ModelId
    >(
      [...toolResultsByReadingUsage].flatMap(
        ([readingRunUsageModelId, toolResults]) =>
          toolResults.map(({ item }) => [item, readingRunUsageModelId] as const)
      )
    );

    const usageRows = orderedUsages.map((usage, index) => {
      const costSplit = splitRecordedCostIntoInputAndOutput(usage);
      const toolResults =
        toolResultsByReadingUsage.get(usage.runUsageModelId) ?? [];
      const toolResultTokensCount = toolResults.reduce(
        (total, { tokensCount }) => total + tokensCount,
        0
      );
      const toolResultCostMicroUsd = costSplit.isOk()
        ? costSplit.value.inputCostMicroUsd *
          toolResultShareOfInputCost({
            usage,
            toolResultTokensCount,
            priceRatios: getCachedTokenPriceRatios(usage),
          })
        : null;
      const previousUsage = orderedUsages[index - 1];
      const cachedTokensBeyondPreviousUsage =
        previousUsage && previousUsage.runModelId !== usage.runModelId
          ? (usage.cachedTokens ?? 0) -
            (previousUsage.promptTokens + previousUsage.completionTokens)
          : null;
      const billedCreditMicro = usageBilledCreditMicroByRunUsageModelId.get(
        usage.runUsageModelId
      );
      const usageItems =
        itemsByRunUsageModelId.get(usage.runUsageModelId) ?? [];
      const allocation = allocateUsageCredits({
        usage,
        billedCreditMicro: billedCreditMicro ?? 0,
        usageItems,
        toolResults,
      });
      return {
        usage,
        costSplit,
        toolResultTokensCount,
        toolResultCostMicroUsd,
        cachedTokensBeyondPreviousUsage,
        billedCreditMicro,
        allocation: allocation.isOk() ? "ok" : allocation.error,
        outputItemsWeight: usageItems
          .filter((item) => usageCostPartPayingFor(item.itemType) === "output")
          .reduce((total, item) => total + (item.outputTokensCount ?? 0), 0),
        promptItems: usageItems.filter(
          (item) => usageCostPartPayingFor(item.itemType) === "input"
        ).length,
      };
    });

    console.log(
      "\nStep 3: each usage's recorded cost splits into output, tool results read, and prompt"
    );
    console.table(
      usageRows.map(
        ({
          usage,
          costSplit,
          toolResultTokensCount,
          toolResultCostMicroUsd,
          cachedTokensBeyondPreviousUsage,
        }) => ({
          usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
          runUsageId: usage.runUsageModelId,
          runKey: usage.runKey ?? "none",
          model: usage.modelId,
          promptTokens: usage.promptTokens,
          cachedTokens: usage.cachedTokens ?? 0,
          cacheWriteTokens: usage.cacheCreationTokens ?? 0,
          completionTokens: usage.completionTokens,
          toolResultTokensRead: toolResultTokensCount,
          cacheWarmedByUnbilledRequest:
            cachedTokensBeyondPreviousUsage !== null &&
            cachedTokensBeyondPreviousUsage >
              MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS,
          recordedCostCredits: credits(
            creditMicroFromCostMicroUsd(usage.costMicroUsd)
          ),
          outputCostCredits: costSplit.isOk()
            ? credits(
                creditMicroFromCostMicroUsd(costSplit.value.outputCostMicroUsd)
              )
            : costSplit.error,
          toolResultCostCredits:
            toolResultCostMicroUsd === null
              ? "n/a"
              : credits(creditMicroFromCostMicroUsd(toolResultCostMicroUsd)),
          promptCostCredits:
            costSplit.isOk() && toolResultCostMicroUsd !== null
              ? credits(
                  creditMicroFromCostMicroUsd(
                    costSplit.value.inputCostMicroUsd - toolResultCostMicroUsd
                  )
                )
              : "n/a",
        })
      )
    );

    console.log(
      "\nStep 4: each usage's billed share is split in proportion to those costs"
    );
    console.table(
      usageRows.map(
        ({
          usage,
          costSplit,
          toolResultCostMicroUsd,
          billedCreditMicro,
          allocation,
          outputItemsWeight,
          promptItems,
        }) => {
          const costMicroUsd = costSplit.isOk()
            ? costSplit.value.inputCostMicroUsd +
              costSplit.value.outputCostMicroUsd
            : 0;
          const creditMicroOf = (partCostMicroUsd: number) =>
            costMicroUsd > 0 && billedCreditMicro !== undefined
              ? credits((partCostMicroUsd * billedCreditMicro) / costMicroUsd)
              : "n/a";
          return {
            usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
            billedCredits: credits(billedCreditMicro),
            billedOverRecordedCost:
              costMicroUsd > 0 && billedCreditMicro !== undefined
                ? Math.round(
                    (billedCreditMicro /
                      creditMicroFromCostMicroUsd(costMicroUsd)) *
                      10_000
                  ) / 10_000
                : "n/a",
            outputCredits: costSplit.isOk()
              ? creditMicroOf(costSplit.value.outputCostMicroUsd)
              : "n/a",
            toolResultCredits:
              toolResultCostMicroUsd === null
                ? "n/a"
                : creditMicroOf(toolResultCostMicroUsd),
            promptCredits:
              costSplit.isOk() && toolResultCostMicroUsd !== null
                ? creditMicroOf(
                    costSplit.value.inputCostMicroUsd - toolResultCostMicroUsd
                  )
                : "n/a",
            outputItemsWeight,
            promptItems,
            allocation,
          };
        }
      )
    );
    for (const {
      usage,
      allocation,
      outputItemsWeight,
      promptItems,
    } of usageRows) {
      if (allocation !== "ok") {
        findings.push({
          flag: allocation,
          detail:
            `Usage ${usageNumberByRunUsageModelId.get(usage.runUsageModelId)} cannot be split: ` +
            `output items weigh ${outputItemsWeight} tokens, ${promptItems} items pay for its prompt.`,
        });
      }
    }

    let creditMicroBeforeRoundingByItem: Map<
      AgentMessageConsumptionItemResource,
      number
    > | null = new Map(
      reportedItems.map((item) => [item, item.directCreditAmountMicro ?? 0])
    );
    for (const usage of usages) {
      const sharesResult = allocateUsageCredits({
        usage,
        billedCreditMicro: Math.round(
          creditMicroFromCostMicroUsd(usage.costMicroUsd)
        ),
        usageItems: itemsByRunUsageModelId.get(usage.runUsageModelId) ?? [],
        toolResults: toolResultsByReadingUsage.get(usage.runUsageModelId) ?? [],
      });
      if (sharesResult.isErr()) {
        creditMicroBeforeRoundingByItem = null;
        break;
      }
      for (const { item, creditMicro } of sharesResult.value) {
        creditMicroBeforeRoundingByItem.set(
          item,
          (creditMicroBeforeRoundingByItem.get(item) ?? 0) + creditMicro
        );
      }
    }

    console.log(
      "\nStep 5: items receive their usages' shares, plus their tool fees (before rounding: each usage shares its recorded cost instead of its billed share)"
    );
    console.table(
      reportedItems.map((item) => {
        const readingRunUsageModelId = readingRunUsageModelIdByItem.get(item);
        return {
          itemId: item.id,
          type: item.itemType,
          version: item.attributionVersion,
          action:
            item.agentMCPActionId === null
              ? "n/a"
              : (actionSIdByModelId.get(item.agentMCPActionId) ?? "n/a"),
          usage: usageNumberByRunUsageModelId.get(item.runUsageId) ?? "n/a",
          resultReadByUsage:
            readingRunUsageModelId === undefined
              ? "n/a"
              : (usageNumberByRunUsageModelId.get(readingRunUsageModelId) ??
                "n/a"),
          inputTokens: item.inputTokensCount ?? "n/a",
          outputTokens: item.outputTokensCount ?? "n/a",
          grossCredits: credits(item.grossAttributedCreditAmountMicro),
          toolFeeCredits: credits(item.directCreditAmountMicro),
          reconciledCreditsBeforeRounding: credits(
            creditMicroBeforeRoundingByItem?.get(item)
          ),
          reconciledCredits: credits(reconciledCreditMicroByItem?.get(item)),
        };
      })
    );

    console.log("\nTotal");
    console.table([
      {
        bill: billedCredits ?? "n/a",
        reconciledCreditsBeforeRounding: creditMicroBeforeRoundingByItem
          ? credits(
              sumCreditMicro(
                reportedItems,
                (item) => creditMicroBeforeRoundingByItem?.get(item) ?? 0
              )
            )
          : "n/a",
        reconciledCredits: reconciledCreditMicroByItem
          ? credits(
              sumCreditMicro(
                reportedItems,
                (item) => reconciledCreditMicroByItem.get(item) ?? 0
              )
            )
          : "n/a",
      },
    ]);

    // Tool results are read by the first call of the next run, so the growth of that call's prompt
    // over the first call of the emitting run is the provider's own count of what the tool results
    // added, plus the emitting call's output and message framing.
    const firstUsagesOfRuns = orderedUsages.filter(
      (usage, index) =>
        index === 0 || orderedUsages[index - 1].runModelId !== usage.runModelId
    );
    const toolResultReadRows = firstUsagesOfRuns.flatMap(
      (readingUsage, index) => {
        const emittingUsage = firstUsagesOfRuns[index - 1];
        const toolResults =
          toolResultsByReadingUsage.get(readingUsage.runUsageModelId) ?? [];
        if (!emittingUsage || toolResults.length === 0) {
          return [];
        }
        const estimatedTokens = toolResults.reduce(
          (total, { tokensCount }) => total + tokensCount,
          0
        );
        const promptGrowthTokens =
          readingUsage.promptTokens - emittingUsage.promptTokens;
        const observedMinTokens =
          promptGrowthTokens - emittingUsage.completionTokens;
        const observedMaxTokens =
          observedMinTokens + (emittingUsage.reasoningTokens ?? 0);
        const segments = toolResultTokensByPromptSegment(
          readingUsage,
          estimatedTokens
        );
        return [
          {
            readingUsage: usageNumberByRunUsageModelId.get(
              readingUsage.runUsageModelId
            ),
            emittingUsage: usageNumberByRunUsageModelId.get(
              emittingUsage.runUsageModelId
            ),
            model: readingUsage.modelId,
            toolResults: toolResults.length,
            estimatedTokens,
            observedMinTokens,
            observedMaxTokens,
            estimatedOverObserved: ratio(estimatedTokens, observedMaxTokens),
            uncachedPromptTokens: segments.uncachedTokens,
            pricedFreshTokens: segments.inFreshTokens,
            pricedCacheWriteTokens: segments.inCacheWriteTokens,
            pricedCacheReadTokens: segments.inCachedTokens,
            beyondPromptTokens: segments.beyondPromptTokens,
            verdict: tokenizerVerdict({
              estimatedTokens,
              observedMinTokens,
              observedMaxTokens,
            }),
          },
        ];
      }
    );
    console.log(
      "\nTokenizer: tool result tokens estimated vs observed by the reading call " +
        "(observed = prompt growth minus the emitting call's output; max assumes its reasoning was not re-sent)"
    );
    console.table(toolResultReadRows);
    for (const row of toolResultReadRows) {
      const where = `Usage ${row.readingUsage} read ${row.estimatedTokens} estimated tool result tokens, observed ${row.observedMinTokens}-${row.observedMaxTokens}`;
      if (
        row.verdict === "tokenizer_overestimates" ||
        row.verdict === "tokenizer_underestimates"
      ) {
        findings.push({ flag: row.verdict, detail: `${where}.` });
      }
      if (row.pricedCacheReadTokens > 0) {
        findings.push({
          flag: "tool_results_priced_as_cache_reads",
          detail: `${where}: ${row.pricedCacheReadTokens} estimated tokens exceed the ${row.uncachedPromptTokens} uncached prompt tokens and are priced as cache reads.`,
        });
      }
      if (row.beyondPromptTokens > 0) {
        findings.push({
          flag: "tool_results_exceed_reading_prompt",
          detail: `${where}: ${row.beyondPromptTokens} estimated tokens exceed the whole prompt and are dropped.`,
        });
      }
    }

    // Sandbox children are invoked inside their parent's sandbox, the outer model never sees them.
    const modelVisibleToolActions = actions.filter(
      (action) =>
        toolItemByActionModelId.has(action.id) &&
        !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
    );
    const enrichedActions =
      await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
        actions: modelVisibleToolActions,
        ignoreContent: false,
      });
    const enrichedActionByModelId = new Map(
      enrichedActions.map((action) => [action.id, action])
    );
    const usageByRunUsageModelId = new Map(
      usages.map((usage) => [usage.runUsageModelId, usage])
    );
    const toolCallsByModelId = new Map<
      string,
      Array<{
        action: AgentMCPActionWithOutputType;
        functionCallArguments: string;
      }>
    >();
    for (const action of modelVisibleToolActions) {
      const item = toolItemByActionModelId.get(action.id);
      const usage = item ? usageByRunUsageModelId.get(item.runUsageId) : null;
      const enrichedAction = enrichedActionByModelId.get(action.id);
      if (!usage || !enrichedAction) {
        continue;
      }
      const toolCalls = toolCallsByModelId.get(usage.modelId) ?? [];
      toolCalls.push({
        action: enrichedAction,
        functionCallArguments: action.functionCallArguments,
      });
      toolCallsByModelId.set(usage.modelId, toolCalls);
    }

    const credentials = await getLlmCredentials(auth, {
      skipEmbeddingApiKeyRequirement: true,
    });
    const footprintByActionModelId = new Map<
      ModelId,
      {
        recomputedCallTokens: number;
        recomputedResultTokens: number;
        resultTokensByTokenizer: Record<string, number | "n/a">;
      }
    >();
    for (const [modelId, toolCalls] of toolCallsByModelId) {
      const measurementsResult = await measureToolCallFootprints(auth, {
        modelId,
        capabilities,
        toolCalls,
      });
      if (measurementsResult.isErr()) {
        findings.push({
          flag: "footprint_measurement_failed",
          detail: `${modelId}: ${measurementsResult.error.message}`,
        });
        continue;
      }

      const model = getModelConfigByModelId(modelId);
      const alternativeCountsByTokenizer = new Map<string, number[]>();
      if (model) {
        const enabledSkillInputTextByActionId =
          await getEnabledSkillInputTextByActionId(
            auth,
            toolCalls.map(({ action }) => action),
            { toolSearchEnabled: isToolSearchEnabledForModel(model) }
          );
        const inputTexts = toolCalls.map(
          (toolCall) =>
            toolCallFootprintTexts(
              toolCall,
              capabilities,
              enabledSkillInputTextByActionId.get(toolCall.action.sId)
            ).inputText
        );
        for (const base of ALTERNATIVE_TOKENIZER_BASES) {
          const countsResult = await tokenCountForTexts(
            inputTexts,
            {
              ...model,
              tokenizer: { type: "tiktoken", base },
              tokenCountAdjustment: 1,
            },
            credentials
          );
          if (countsResult.isOk()) {
            alternativeCountsByTokenizer.set(base, countsResult.value);
          }
        }
        if (compareOpenAI && model.providerId === "openai") {
          if (!credentials.OPENAI_API_KEY) {
            throw new Error("OPENAI_API_KEY is required for --compareOpenAI.");
          }
          const counts: number[] = [];
          for (const input of inputTexts) {
            counts.push(
              await countOpenAIInputTokens({
                apiKey: credentials.OPENAI_API_KEY,
                baseUrl: openAIBaseUrl(credentials),
                input,
                modelId,
              })
            );
          }
          alternativeCountsByTokenizer.set("openai_endpoint", counts);
        }
        if (compareGemini && model.providerId === "google_ai_studio") {
          if (!credentials.GOOGLE_AI_STUDIO_API_KEY) {
            throw new Error(
              "GOOGLE_AI_STUDIO_API_KEY is required for --compareGemini."
            );
          }
          const client = new GoogleGenAI({
            apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
          });
          const counts: number[] = [];
          for (const input of inputTexts) {
            counts.push(
              await countGeminiInputTokens({ client, input, modelId })
            );
          }
          alternativeCountsByTokenizer.set("gemini_endpoint", counts);
        }
      }

      measurementsResult.value.forEach((measurement, index) => {
        footprintByActionModelId.set(toolCalls[index].action.id, {
          recomputedCallTokens: measurement.callOutputTokensCount,
          recomputedResultTokens: measurement.inputTokensCount,
          resultTokensByTokenizer: Object.fromEntries(
            [...alternativeCountsByTokenizer].map(([tokenizer, counts]) => [
              tokenizer,
              counts[index] ?? "n/a",
            ])
          ),
        });
      });
    }

    const toolItemFootprintRows = modelVisibleToolActions.flatMap((action) => {
      const item = toolItemByActionModelId.get(action.id);
      const usage = item ? usageByRunUsageModelId.get(item.runUsageId) : null;
      const enrichedAction = enrichedActionByModelId.get(action.id);
      if (!item || !usage || !enrichedAction) {
        return [];
      }
      const footprint = footprintByActionModelId.get(action.id);
      const readingRunUsageModelId = readingRunUsageModelIdByItem.get(item);
      const tokenizer = getModelConfigByModelId(usage.modelId)?.tokenizer;
      return [
        {
          action: action.sId,
          tool: action.toolName,
          model: usage.modelId,
          tokenizer: tokenizer ? `${tokenizer.type}:${tokenizer.base}` : "n/a",
          readByUsage:
            readingRunUsageModelId === undefined
              ? "not_read"
              : (usageNumberByRunUsageModelId.get(readingRunUsageModelId) ??
                "n/a"),
          storedResultTokens: item.inputTokensCount ?? "pending",
          recomputedResultTokens: footprint?.recomputedResultTokens ?? "n/a",
          ...footprint?.resultTokensByTokenizer,
          storedCallTokens: item.outputTokensCount ?? "n/a",
          recomputedCallTokens: footprint?.recomputedCallTokens ?? "n/a",
          offloadedBlocks: countOffloadedBlocks(enrichedAction),
        },
      ];
    });
    console.log(
      "\nTokenizer: each tool item's stored footprint vs recomputed now, and with other tokenizers"
    );
    console.table(toolItemFootprintRows);
    const driftedFootprints = toolItemFootprintRows.filter(
      (row) =>
        row.readByUsage !== "not_read" &&
        row.storedResultTokens !== "pending" &&
        row.recomputedResultTokens !== "n/a" &&
        row.storedResultTokens !== row.recomputedResultTokens
    );
    if (driftedFootprints.length > 0) {
      findings.push({
        flag: "footprint_drift",
        detail: `Actions ${driftedFootprints.map(({ action }) => action).join(", ")} store a result footprint the current code no longer computes.`,
      });
    }

    const toolCallBudgetRows = orderedUsages.flatMap((usage) => {
      const toolItems = (
        itemsByRunUsageModelId.get(usage.runUsageModelId) ?? []
      ).filter(
        (item) =>
          item.itemType === "tool" &&
          item.agentMCPActionId !== null &&
          footprintByActionModelId.has(item.agentMCPActionId)
      );
      if (toolItems.length === 0) {
        return [];
      }
      const measuredCallTokens = toolItems.reduce(
        (total, item) =>
          total +
          (item.agentMCPActionId === null
            ? 0
            : (footprintByActionModelId.get(item.agentMCPActionId)
                ?.recomputedCallTokens ?? 0)),
        0
      );
      const outputBudgetTokens =
        usage.completionTokens - (usage.reasoningTokens ?? 0);
      return [
        {
          usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
          model: usage.modelId,
          toolCalls: toolItems.length,
          measuredCallTokens,
          storedCallTokens: toolItems.reduce(
            (total, item) => total + (item.outputTokensCount ?? 0),
            0
          ),
          outputBudgetTokens,
          measuredOverBudget: ratio(measuredCallTokens, outputBudgetTokens),
          scaledDown: measuredCallTokens > outputBudgetTokens,
        },
      ];
    });
    console.log(
      "\nTokenizer: tool call tokens measured vs the usage's non-reasoning output"
    );
    console.table(toolCallBudgetRows);
    for (const row of toolCallBudgetRows) {
      if (row.scaledDown) {
        findings.push({
          flag: "tool_calls_exceed_output_budget",
          detail: `Usage ${row.usage} measured ${row.measuredCallTokens} tool call tokens for ${row.outputBudgetTokens} non-reasoning output tokens: tool calls were scaled down and the output item got the rest.`,
        });
      }
    }

    const attemptsByRunModelId = new Map<
      ModelId,
      RunUsageAttemptWithRunType[]
    >();
    for (const attempt of attempts) {
      const runAttempts = attemptsByRunModelId.get(attempt.runModelId) ?? [];
      runAttempts.push(attempt);
      attemptsByRunModelId.set(attempt.runModelId, runAttempts);
    }
    console.log("\nRun usage attempts, in run order");
    console.table(
      orderedRuns.flatMap((run, runIndex) => {
        const runAttempts = attemptsByRunModelId.get(run.id) ?? [];
        if (runAttempts.length === 0) {
          return [
            {
              run: runIndex + 1,
              dustRunId: run.dustRunId,
              runKey: run.runKey,
              runCreatedAt: run.createdAt.toISOString(),
              attempt: "none",
            },
          ];
        }
        return runAttempts.map((attempt, attemptIndex) => ({
          run: runIndex + 1,
          dustRunId: run.dustRunId,
          runKey: run.runKey,
          runCreatedAt: run.createdAt.toISOString(),
          attempt: `${attemptIndex + 1}/${runAttempts.length}`,
          usage:
            usageNumberByRunUsageModelId.get(attempt.runUsageModelId) ??
            "not_billed",
          state: attempt.usageState ?? "null",
          model: attempt.modelId,
          promptTokens: attempt.promptTokens,
          cachedTokens: attempt.cachedTokens ?? 0,
          cacheWriteTokens: attempt.cacheCreationTokens ?? 0,
          completionTokens: attempt.completionTokens,
          reasoningTokens: attempt.reasoningTokens ?? 0,
          costCredits: credits(
            creditMicroFromCostMicroUsd(attempt.costMicroUsd)
          ),
        }));
      })
    );
    if (runs.length < dustRunIds.length) {
      findings.push({
        flag: "message_runs_not_found",
        detail: `${dustRunIds.length - runs.length} of the message's ${dustRunIds.length} run ids have no run, possibly past the run retention cutoff.`,
      });
    }
    const runModelIdsWithUsage = new Set(
      usages.map((usage) => usage.runModelId)
    );
    const runsWithoutUsage = orderedRuns.filter(
      (run) => !runModelIdsWithUsage.has(run.id)
    );
    if (runsWithoutUsage.length > 0) {
      findings.push({
        flag: "run_without_reported_usage",
        detail: `Runs ${runsWithoutUsage.map((run) => run.dustRunId).join(", ")} reported no usage.`,
      });
    }
    const unreportedAttempts = attempts.filter(
      (attempt) => !usageNumberByRunUsageModelId.has(attempt.runUsageModelId)
    );
    if (unreportedAttempts.length > 0) {
      findings.push({
        flag: "unreported_usage_attempts",
        detail: `${unreportedAttempts.length} usage attempts are pending or unavailable: they are neither billed nor attributed.`,
      });
    }

    const messageRef = { agentMessageId, conversationId, workspaceId };
    findings.push(...(await printAttributionWorkflowHistory(messageRef)));
    findings.push(...(await printAgentLoopModelActivityAttempts(messageRef)));

    console.log("\nDiagnosis");
    console.table(
      findings.length > 0
        ? findings
        : [{ flag: "none", detail: "No anomaly found." }]
    );
  }
);
