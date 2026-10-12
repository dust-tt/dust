/**
 * Explains how an agent message's bill is reconciled across its consumption items, step by step,
 * or where the reconciliation fails. Compares the tokenizer estimates of tool footprints with what
 * the provider reported, and ends with a diagnosis listing every anomaly found.
 *
 * This script is read-only and never logs tool result contents. `--compareOpenAI` and
 * `--compareGemini` send the rendered tool results to the provider's token-count endpoint.
 *
 * npx tsx scripts/debug_agent_message_consumption_allocation.ts -w 8DpNy5tEUG -m Ut5LbnRe3M
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

const ALTERNATIVE_TOKENIZERS = [
  { label: "o200k", base: "o200k_base" },
  { label: "cl100k", base: "cl100k_base" },
  { label: "anthropic", base: "anthropic_base" },
] as const satisfies Array<{ label: string; base: TiktokenTokenizerBase }>;

type Cell = string | number | boolean | null | undefined;

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

function printTable(title: string, rows: Array<Record<string, Cell>>): void {
  console.log(`\n${title}`);
  console.table(rows);
}

function printRecord(title: string, record: Record<string, Cell>): void {
  console.log(`\n${title}`);
  console.table(record);
}

function timeOf(date: Date): string {
  return date.toISOString().slice(11, 23);
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
    const executionRows: Array<Record<string, Cell>> = [];
    const eventRows: Array<Record<string, Cell>> = [];
    let failedActivities = 0;

    for await (const execution of client.workflow.list({
      query: `WorkflowId = ${JSON.stringify(workflowId)}`,
    })) {
      const handle = client.workflow.getHandle(workflowId, execution.runId);
      const executionNumber = executionRows.length + 1;
      const [description, history] = await Promise.all([
        handle.describe(),
        handle.fetchHistory(),
      ]);
      const activityByScheduledEventId = new Map<string, string>();

      for (const event of history.events ?? []) {
        const eventAt = event.eventTime
          ? timeOf(tsToDate(event.eventTime))
          : "n/a";
        const signal = event.workflowExecutionSignaledEventAttributes;
        if (signal) {
          eventRows.push({
            execution: executionNumber,
            at: eventAt,
            event: "signal",
            detail: signal.signalName ?? "unknown",
          });
        }

        const scheduled = event.activityTaskScheduledEventAttributes;
        if (scheduled) {
          const activity = scheduled.activityType?.name ?? "unknown";
          activityByScheduledEventId.set(String(event.eventId), activity);
          eventRows.push({
            execution: executionNumber,
            at: eventAt,
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
            execution: executionNumber,
            at: eventAt,
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
        execution: executionNumber,
        runId: execution.runId,
        status: execution.status.name,
        start: execution.startTime.toISOString(),
        close: execution.closeTime?.toISOString() ?? "running",
        pending: pendingActivity?.activityType?.name ?? "none",
        attempt: pendingActivity?.attempt ?? "-",
        failure: pendingActivity?.lastFailure?.message || "none",
      });
    }

    printTable(`Attribution workflow ${workflowId}`, executionRows);
    printTable("Attribution workflow events (UTC times)", eventRows);

    const findings: Finding[] = [];
    if (executionRows.length === 0) {
      findings.push({
        flag: "attribution_workflow_not_found",
        detail: `No execution of ${workflowId}: attribution never ran or its history expired.`,
      });
    }
    const pendingFailures = executionRows.filter(
      (row) => row.failure !== "none"
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
    printRecord("Attribution workflow history unavailable", {
      workflowId,
      error: errorMessage,
    });
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
    const rows: Array<Record<string, Cell>> = [];
    let retriedAttempts = 0;

    for (const event of history.events ?? []) {
      const eventAt = event.eventTime
        ? timeOf(tsToDate(event.eventTime))
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
        rows.push({ at: eventAt, event: "started", attempt });
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
          at: eventAt,
          event: event.activityTaskCompletedEventAttributes
            ? "completed"
            : event.activityTaskFailedEventAttributes
              ? "failed"
              : event.activityTaskTimedOutEventAttributes
                ? "timed_out"
                : "canceled",
          attempt: "-",
        });
      }
    }

    printTable("Agent loop model activity attempts (UTC times)", rows);
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
    printRecord("Agent loop history unavailable", {
      workflowId,
      error: errorMessage,
    });
    return [{ flag: "temporal_unavailable", detail: errorMessage }];
  }
}

makeScript(
  {
    workspaceId: {
      alias: "w",
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    agentMessageId: {
      alias: "m",
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
    execute: {
      type: "boolean",
      default: true,
      hidden: true,
    },
  },
  async ({ agentMessageId, compareGemini, compareOpenAI, workspaceId }) => {
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

    printRecord("Result", {
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
    });

    const attributionVersions = [
      ...new Set(items.map(({ attributionVersion }) => attributionVersion)),
    ].sort((left, right) => right - left);
    printTable(
      "Stored attribution versions, newest first",
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
          version: attributionVersion,
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
        model: usage.modelId,
        input: itemTypes.has("input"),
        output: itemTypes.has("output"),
        reasoning: needsReasoning ? itemTypes.has("reasoning") : "-",
        complete:
          itemTypes.has("input") &&
          itemTypes.has("output") &&
          (!needsReasoning || itemTypes.has("reasoning")),
      };
    });
    printTable(
      "Usages (numbered in run order) and their model items: input, output, reasoning when reported",
      modelEvidenceRows
    );
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
        child: isSandboxChildActionInfo(
          action.stepContext.sandboxChildActionInfo
        ),
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
    const toolEvidenceGapRows = toolEvidenceRows.filter(
      ({ gap }) => gap !== "ok"
    );
    printTable(
      `Tool items: ${actions.length - toolEvidenceGapRows.length}/${actions.length} actions ok, ` +
        `${itemsWithoutAction.length} items without action. Actions with a gap:`,
      toolEvidenceGapRows
    );
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

    printTable("Step 1: the LLM part of the bill must match its usages", [
      {
        quantity: "bill",
        credits: billedCredits ?? "n/a",
        meaning: "charged to the message",
      },
      {
        quantity: "tool_fees",
        credits: credits(toolFeesCreditMicro),
        meaning: "tool items' direct credits",
      },
      {
        quantity: "llm_bill",
        credits: credits(llmBilledCreditMicro),
        meaning: "bill - tool_fees",
      },
      {
        quantity: "llm_from_usages",
        credits: credits(recomputedLlmBilledCreditMicro),
        meaning: "usages' cost rounded up per group",
      },
      {
        quantity: "llm_charged",
        credits: chargedLlmBilledCredits,
        meaning: "same, after free-origin waiver",
      },
      {
        quantity: "llm_bill_gap",
        credits: credits(llmBillGapCreditMicro),
        meaning: "llm_bill - llm_from_usages, must be 0",
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
          stored: credits(item.directCreditAmountMicro),
          planned: credits(planned?.creditMicro),
          disposition: planned?.billingDisposition ?? "no_billing_line",
          matches: storedCreditMicro === plannedCreditMicro,
        },
      ];
    });
    printTable(
      "Tool fees (credits): stored on the items vs the billing plan",
      toolFeeRows
    );
    const mismatchedToolFees = toolFeeRows.filter(({ matches }) => !matches);
    if (mismatchedToolFees.length > 0) {
      findings.push({
        flag: "tool_fee_differs_from_billing_plan",
        detail: `Actions ${mismatchedToolFees.map(({ action }) => action).join(", ")} store a fee the billing plan would not charge today.`,
      });
    }

    printTable(
      "Step 2 (credits): each billing group's bill is shared by its usages",
      llmBillingPlan.llm.map((line) => {
        const costCreditMicro = creditMicroFromCostMicroUsd(
          line.providerCostMicroUsd
        );
        const billedCreditMicro = roundCreditsToMicroCredits(
          line.billedCredits
        );
        return {
          runKey: line.runKey,
          model: line.modelId,
          usages: line.usageAllocations?.length ?? 0,
          cost: credits(costCreditMicro),
          billed: credits(billedCreditMicro),
          rounding: credits(billedCreditMicro - costCreditMicro),
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

    printTable(
      "Step 3: each usage's recorded cost splits into output, tool results read and prompt " +
        "(tokens, then credits)",
      usageRows.map(
        ({
          usage,
          costSplit,
          toolResultTokensCount,
          toolResultCostMicroUsd,
          cachedTokensBeyondPreviousUsage,
        }) => ({
          usage: usageNumberByRunUsageModelId.get(usage.runUsageModelId),
          prompt: usage.promptTokens,
          cached: usage.cachedTokens ?? 0,
          cacheWrite: usage.cacheCreationTokens ?? 0,
          completion: usage.completionTokens,
          resultsRead: toolResultTokensCount,
          warmedElsewhere:
            cachedTokensBeyondPreviousUsage !== null &&
            cachedTokensBeyondPreviousUsage >
              MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS,
          cost: credits(creditMicroFromCostMicroUsd(usage.costMicroUsd)),
          outputCost: costSplit.isOk()
            ? credits(
                creditMicroFromCostMicroUsd(costSplit.value.outputCostMicroUsd)
              )
            : costSplit.error,
          resultsCost:
            toolResultCostMicroUsd === null
              ? "n/a"
              : credits(creditMicroFromCostMicroUsd(toolResultCostMicroUsd)),
          promptCost:
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

    printTable(
      "Step 4 (credits): each usage's billed share is split in proportion to those costs",
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
            billed: credits(billedCreditMicro),
            billedOverCost:
              costMicroUsd > 0 && billedCreditMicro !== undefined
                ? Math.round(
                    (billedCreditMicro /
                      creditMicroFromCostMicroUsd(costMicroUsd)) *
                      10_000
                  ) / 10_000
                : "n/a",
            output: costSplit.isOk()
              ? creditMicroOf(costSplit.value.outputCostMicroUsd)
              : "n/a",
            results:
              toolResultCostMicroUsd === null
                ? "n/a"
                : creditMicroOf(toolResultCostMicroUsd),
            prompt:
              costSplit.isOk() && toolResultCostMicroUsd !== null
                ? creditMicroOf(
                    costSplit.value.inputCostMicroUsd - toolResultCostMicroUsd
                  )
                : "n/a",
            outputWeight: outputItemsWeight,
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

    printTable(
      "Step 5 (credits): items receive their usages' shares plus their tool fees " +
        "(unrounded: each usage shares its recorded cost instead of its billed share)",
      reportedItems.map((item) => {
        const readingRunUsageModelId = readingRunUsageModelIdByItem.get(item);
        return {
          item: item.id,
          type: item.itemType,
          action:
            item.agentMCPActionId === null
              ? "n/a"
              : (actionSIdByModelId.get(item.agentMCPActionId) ?? "n/a"),
          usage: usageNumberByRunUsageModelId.get(item.runUsageId) ?? "n/a",
          readBy:
            readingRunUsageModelId === undefined
              ? "-"
              : (usageNumberByRunUsageModelId.get(readingRunUsageModelId) ??
                "n/a"),
          inTokens: item.inputTokensCount,
          outTokens: item.outputTokensCount,
          gross: credits(item.grossAttributedCreditAmountMicro),
          fee: credits(item.directCreditAmountMicro),
          unrounded: credits(creditMicroBeforeRoundingByItem?.get(item)),
          reconciled: credits(reconciledCreditMicroByItem?.get(item)),
        };
      })
    );

    printRecord("Total (credits)", {
      bill: billedCredits ?? "n/a",
      unrounded: creditMicroBeforeRoundingByItem
        ? credits(
            sumCreditMicro(
              reportedItems,
              (item) => creditMicroBeforeRoundingByItem?.get(item) ?? 0
            )
          )
        : "n/a",
      reconciled: reconciledCreditMicroByItem
        ? credits(
            sumCreditMicro(
              reportedItems,
              (item) => reconciledCreditMicroByItem.get(item) ?? 0
            )
          )
        : "n/a",
    });

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
            reader: usageNumberByRunUsageModelId.get(
              readingUsage.runUsageModelId
            ),
            emitter: usageNumberByRunUsageModelId.get(
              emittingUsage.runUsageModelId
            ),
            results: toolResults.length,
            estimated: estimatedTokens,
            observedMin: observedMinTokens,
            observedMax: observedMaxTokens,
            ratio: ratio(estimatedTokens, observedMinTokens),
            gap: observedMinTokens - estimatedTokens,
            gapPerResult: Math.round(
              (observedMinTokens - estimatedTokens) / toolResults.length
            ),
            uncached: segments.uncachedTokens,
            atFresh: segments.inFreshTokens,
            atWrite: segments.inCacheWriteTokens,
            atCached: segments.inCachedTokens,
            beyond: segments.beyondPromptTokens,
            verdict: tokenizerVerdict({
              estimatedTokens,
              observedMinTokens,
              observedMaxTokens,
            }),
          },
        ];
      }
    );
    printTable(
      "Tokenizer: tool result tokens estimated vs observed by the reading usage\n" +
        "observed = reader's prompt - emitter's prompt - emitter's output (min: reasoning re-sent, usually the real one; max: not re-sent)\n" +
        "ratio = estimated / observedMin; gap = observedMin - estimated, mostly tool-result framing\n" +
        "at*: where the estimate was priced in the reader's prompt; beyond: dropped past the prompt",
      toolResultReadRows
    );
    for (const row of toolResultReadRows) {
      const where = `Usage ${row.reader} read ${row.estimated} estimated tool result tokens, observed ${row.observedMin}-${row.observedMax}`;
      if (
        row.verdict === "tokenizer_overestimates" ||
        row.verdict === "tokenizer_underestimates"
      ) {
        findings.push({ flag: row.verdict, detail: `${where}.` });
      }
      if (row.atCached > 0) {
        findings.push({
          flag: "tool_results_priced_as_cache_reads",
          detail: `${where}: ${row.atCached} estimated tokens exceed the ${row.uncached} uncached prompt tokens and are priced as cache reads.`,
        });
      }
      if (row.beyond > 0) {
        findings.push({
          flag: "tool_results_exceed_reading_prompt",
          detail: `${where}: ${row.beyond} estimated tokens exceed the whole prompt and are dropped.`,
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
        for (const { label, base } of ALTERNATIVE_TOKENIZERS) {
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
            alternativeCountsByTokenizer.set(label, countsResult.value);
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
          alternativeCountsByTokenizer.set("openai", counts);
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
          alternativeCountsByTokenizer.set("gemini", counts);
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
          tokenizer: tokenizer?.base ?? "n/a",
          readBy:
            readingRunUsageModelId === undefined
              ? "not_read"
              : (usageNumberByRunUsageModelId.get(readingRunUsageModelId) ??
                "n/a"),
          stored: item.inputTokensCount ?? "pending",
          now: footprint?.recomputedResultTokens ?? "n/a",
          ...footprint?.resultTokensByTokenizer,
          callStored: item.outputTokensCount ?? "n/a",
          callNow: footprint?.recomputedCallTokens ?? "n/a",
          offloaded: countOffloadedBlocks(enrichedAction),
        },
      ];
    });
    printTable(
      "Tokenizer: each tool item's result tokens stored vs recomputed now, then with other tokenizers, " +
        "and its call tokens",
      toolItemFootprintRows
    );
    const driftedFootprints = toolItemFootprintRows.filter(
      (row) =>
        row.readBy !== "not_read" &&
        row.stored !== "pending" &&
        row.now !== "n/a" &&
        row.stored !== row.now
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
          calls: toolItems.length,
          measured: measuredCallTokens,
          stored: toolItems.reduce(
            (total, item) => total + (item.outputTokensCount ?? 0),
            0
          ),
          budget: outputBudgetTokens,
          ratio: ratio(measuredCallTokens, outputBudgetTokens),
          scaledDown: measuredCallTokens > outputBudgetTokens,
        },
      ];
    });
    printTable(
      "Tokenizer: tool call tokens measured vs the usage's non-reasoning output (budget)",
      toolCallBudgetRows
    );
    for (const row of toolCallBudgetRows) {
      if (row.scaledDown) {
        findings.push({
          flag: "tool_calls_exceed_output_budget",
          detail: `Usage ${row.usage} measured ${row.measured} tool call tokens for ${row.budget} non-reasoning output tokens: tool calls were scaled down and the output item got the rest.`,
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
    printTable(
      "Runs, in order",
      orderedRuns.map((run, runIndex) => ({
        run: runIndex + 1,
        dustRunId: run.dustRunId,
        runKey: run.runKey,
        createdAt: run.createdAt.toISOString(),
        attempts: attemptsByRunModelId.get(run.id)?.length ?? 0,
      }))
    );
    printTable(
      "Run usage attempts (tokens, then credits)",
      orderedRuns.flatMap((run, runIndex) => {
        const runAttempts = attemptsByRunModelId.get(run.id) ?? [];
        return runAttempts.map((attempt, attemptIndex) => ({
          run: runIndex + 1,
          attempt: `${attemptIndex + 1}/${runAttempts.length}`,
          usage:
            usageNumberByRunUsageModelId.get(attempt.runUsageModelId) ??
            "not_billed",
          state: attempt.usageState ?? "null",
          model: attempt.modelId,
          prompt: attempt.promptTokens,
          cached: attempt.cachedTokens ?? 0,
          cacheWrite: attempt.cacheCreationTokens ?? 0,
          completion: attempt.completionTokens,
          reasoning: attempt.reasoningTokens ?? 0,
          cost: credits(creditMicroFromCostMicroUsd(attempt.costMicroUsd)),
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
        detail: `Runs ${runsWithoutUsage.map((run) => (runIndexByModelId.get(run.id) ?? 0) + 1).join(", ")} reported no usage.`,
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
    if (findings.length === 0) {
      console.log("No anomaly found.");
    }
    for (const { flag, detail } of findings) {
      console.log(`- ${flag}: ${detail}`);
    }
  }
);
