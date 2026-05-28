import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsTextWithFeedback } from "@app/lib/api/assistant/conversation/render_conversation_with_feedback";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { LlmConversationOptions } from "@app/lib/api/llm/batch_llm";
import {
  downloadBatchResultFromLlm,
  sendBatchCallToLlm,
  storeLlmResult,
} from "@app/lib/api/llm/batch_llm";
import type { BatchStatus } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getRemainingDailyCapMicroUsd } from "@app/lib/api/programmatic_usage/daily_cap";
import { checkProgrammaticUsageLimits } from "@app/lib/api/programmatic_usage/tracking";
import { type Authenticator, hasFeatureFlag } from "@app/lib/auth";
import { isApiBlocked } from "@app/lib/metronome/user_block";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { notifySkillSuggestionsReady } from "@app/lib/notifications/workflows/skill-suggestions-ready";
import {
  buildSkillAggregationBatchMap,
  buildSkillAggregationSystemPrompt,
  createSkillSuggestionsConversation,
  loadSkillAggregationContext,
} from "@app/lib/reinforcement/aggregate_suggestions";
import {
  buildSkillAnalysisPrompt,
  buildSkillAnalysisSystemPrompt,
  buildSkillConversationAnalysisBatchMap,
} from "@app/lib/reinforcement/analyze_conversation";
import { getCurrentPeriod } from "@app/lib/reinforcement/billing";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  getMaxConversationsForBudget,
} from "@app/lib/reinforcement/constants";
import { getReinforcementMonthlyCapMicroUsd } from "@app/lib/reinforcement/consumption";
import {
  buildReinforcedSkillsSpecifications,
  classifySkillToolCalls,
  createReinforcedSkillsConversation,
  getReinforcedSkillsDefaultOptions,
  getReinforcedSkillsLLM,
  processSkillReinforcedEvents,
  REINFORCEMENT_SKILLS_AGENT_ID,
  reinforcedSkillsConversationTitle,
} from "@app/lib/reinforcement/run_reinforced_analysis";
import { findConversationsWithSkills } from "@app/lib/reinforcement/selection";
import {
  prepareReinforcedToolActions,
  type ReinforcedToolActionInfo,
  storeTerminalToolCallResults,
} from "@app/lib/reinforcement/tool_execution";
import type { ReinforcedSkillsOperationType } from "@app/lib/reinforcement/types";
import { REINFORCED_SKILLS_METADATA_KEYS } from "@app/lib/reinforcement/types";
import { getAuthForWorkspace } from "@app/lib/reinforcement/utils";
import {
  hasReinforcementEnabled,
  isReinforcementBatchModeAllowed,
} from "@app/lib/reinforcement/workspace_check";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { CreditResource } from "@app/lib/resources/credit_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { SelfImprovingSkillsUsageCreateBlob } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SelfImprovingSkillsUsageResource } from "@app/lib/resources/self_improving_skills_usage_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { launchAgentMessageAnalytics } from "@app/temporal/agent_loop/activities/analytics";
import {
  launchEmitMetronomeUsageEvents,
  launchTrackProgrammaticUsage,
} from "@app/temporal/agent_loop/activities/usage_tracking";
import { ensureReinforcementWorkspaceSchedules } from "@app/temporal/reinforcement/client";
import type { AgentLoopArgs } from "@app/types/assistant/agent_run";
import { isCreditPricedPlan } from "@app/types/plan";
import { ApplicationFailure } from "@temporalio/common";
import { Op } from "sequelize";

// Re-export runToolActivity so the reinforced skills worker registers it,
// allowing the workflow to call it via proxyActivities.
export { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

/**
 * Report usage for a single reinforcement LLM step to Metronome, ES analytics,
 * and programmatic usage. Gated behind the self_improving_skills_report_usage
 * feature flag. Fire-and-forget: failures are logged but do not break the
 * reinforcement workflow.
 */
async function reportSelfImprovingSkillsStepUsage({
  auth,
  reinforcementConversationId,
  conversationTitle,
  agentMessageId,
  userMessageId,
  dustRunIds,
}: {
  auth: Authenticator;
  reinforcementConversationId: string;
  conversationTitle: string | null;
  agentMessageId: string;
  userMessageId: string;
  dustRunIds?: string[];
}): Promise<void> {
  const hasFlag = await hasFeatureFlag(
    auth,
    "self_improving_skills_report_usage"
  );
  if (!hasFlag) {
    return;
  }

  // Reinforcement messages are created with default version 0 and are never
  // retried at a higher version (Temporal retries create new message sIds).
  const agentLoopArgs: AgentLoopArgs = {
    agentMessageId,
    agentMessageVersion: 0,
    conversationId: reinforcementConversationId,
    conversationTitle,
    conversationBranchId: null,
    userMessageId,
    userMessageVersion: 0,
    userMessageOrigin: "reinforcement",
    dustRunIds,
  };

  try {
    await Promise.all([
      launchAgentMessageAnalytics(auth, agentLoopArgs),
      launchTrackProgrammaticUsage(auth, agentLoopArgs),
      launchEmitMetronomeUsageEvents(auth, agentLoopArgs),
    ]);
  } catch (err) {
    logger.warn(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        reinforcementConversationId,
        agentMessageId,
        err,
      },
      "SelfImprovingSkills: failed to report step usage to billing channels"
    );
  }
}

/**
 * Common logic for a single reinforced skills step (analysis or aggregation).
 *
 * Fetches the reinforcement conversation, renders it for the LLM, streams the
 * response, stores the result, and classifies tool calls. Terminal tool calls
 * are processed into suggestions; exploratory tool calls are returned for the
 * workflow to execute.
 */
async function runReinforcedSkillsStep({
  auth,
  reinforcementConversationId,
  operationType,
  systemPrompt,
  contextId,
  source,
  conversation,
  eligibleSkillIds,
}: {
  auth: Authenticator;
  reinforcementConversationId: string;
  operationType: ReinforcedSkillsOperationType;
  systemPrompt: string;
  contextId: string;
  source: "synthetic" | "reinforcement";
  conversation?: ConversationResource;
  eligibleSkillIds: string[];
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const llm = await getReinforcedSkillsLLM(auth, operationType, {
    forBatch: false,
  });
  if (!llm) {
    logger.error(
      { contextId, workspaceId: auth.getNonNullableWorkspace().sId },
      "ReinforcedSkills: no LLM available for step activity"
    );
    return {
      isTerminal: true,
      suggestionsCreated: 0,
      approvedSourceSuggestionIds: [],
    };
  }

  const conversationRes = await getConversation(
    auth,
    reinforcementConversationId
  );
  if (conversationRes.isErr()) {
    throw conversationRes.error;
  }

  const specifications = buildReinforcedSkillsSpecifications(operationType);
  const modelConfig = llm.getModelConfig();
  const toolsJson = JSON.stringify(
    specifications.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }))
  );

  const renderResult = await renderConversationForModel(auth, {
    conversation: conversationRes.value,
    model: modelConfig,
    prompt: systemPrompt,
    enabledSkills: [],
    tools: toolsJson,
    allowedTokenCount:
      modelConfig.contextSize - modelConfig.generationTokensCount,
  });
  if (renderResult.isErr()) {
    throw renderResult.error;
  }

  const llmParams: LLMStreamParameters = {
    conversation: renderResult.value.modelConversation,
    prompt: systemPrompt,
    specifications,
  };

  const events: LLMEvent[] = [];
  for await (const event of llm.stream(llmParams)) {
    events.push(event);
  }

  // Store agent response in the reinforcement conversation.
  const reinforcementConv = await ConversationResource.fetchById(
    auth,
    reinforcementConversationId
  );
  if (!reinforcementConv) {
    throw new Error(
      `Reinforcement conversation not found: ${reinforcementConversationId}`
    );
  }

  const dustRunIds = [llm.getTraceId()];
  const storedResult = await storeLlmResult(
    auth,
    reinforcementConv,
    events,
    REINFORCEMENT_SKILLS_AGENT_ID,
    { runIds: dustRunIds }
  );

  // Report usage to billing channels (fire-and-forget, gated by flag).
  await reportSelfImprovingSkillsStepUsage({
    auth,
    reinforcementConversationId,
    conversationTitle: reinforcementConv.title,
    agentMessageId: storedResult.agentMessageId,
    userMessageId: storedResult.userMessageId,
    dustRunIds,
  });

  const { exploratoryToolCalls, terminalToolCalls } =
    classifySkillToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    if (terminalToolCalls.length > 0 && exploratoryToolCalls.length > 0) {
      logger.warn(
        { contextId, workspaceId: auth.getNonNullableWorkspace().sId },
        "ReinforcedSkills: LLM is sending both terminal and exploratory tool call."
      );
    }

    const result = await processSkillReinforcedEvents({
      auth,
      events,
      source,
      operationType,
      contextId,
      conversation,
      eligibleSkillIds,
    });

    // Store results for all terminal tool calls so the conversation is complete.
    await storeTerminalToolCallResults(auth, {
      conversation: reinforcementConv.toJSON(),
      successfulToolCalls: result.successfulToolCalls,
      failedToolCalls: result.failedToolCalls,
      agentMessageModelId: storedResult.agentMessageModelId,
    });

    // If any failed, let the LLM retry on the next step.
    if (result.failedToolCalls.length > 0) {
      return {
        isTerminal: false,
        suggestionsCreated: result.suggestionsCreated,
        approvedSourceSuggestionIds: result.approvedSourceSuggestionIds,
      };
    }

    return {
      isTerminal: true,
      suggestionsCreated: result.suggestionsCreated,
      approvedSourceSuggestionIds: result.approvedSourceSuggestionIds,
    };
  }

  // Prepare tool actions for the workflow to execute via runRetryableToolActivity.
  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    conversation: reinforcementConv.toJSON(),
    exploratoryToolCalls,
    agentMessageModelId: storedResult.agentMessageModelId,
    agentMessageId: storedResult.agentMessageId,
    userMessageId: storedResult.userMessageId,
  });

  return {
    isTerminal: false,
    suggestionsCreated: 0,
    approvedSourceSuggestionIds: [],
    toolActionInfo,
  };
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

function getReinforcedSkillIdsFromMetadata(
  metadata: Record<string, unknown>
): string[] {
  const skillIds = metadata[REINFORCED_SKILLS_METADATA_KEYS.reinforcedSkillIds];

  if (!Array.isArray(skillIds)) {
    return [];
  }

  return [
    ...new Set(skillIds.filter((skillId) => typeof skillId === "string")),
  ];
}

function splitPriceMicroUsdAcrossSkills(
  priceMicroUsd: number,
  skillCount: number
): number[] {
  if (skillCount <= 0) {
    return [];
  }

  const basePriceMicroUsd = Math.floor(priceMicroUsd / skillCount);
  const remainderMicroUsd = priceMicroUsd % skillCount;

  return Array.from(
    { length: skillCount },
    (_, index) => basePriceMicroUsd + (index < remainderMicroUsd ? 1 : 0)
  );
}

/**
 * Records reinforcement LLM usage against the skills stored in reinforcement
 * conversation metadata. The write is idempotent for the passed conversations:
 * existing usage rows for those conversation IDs are replaced.
 */
export async function recordSelfImprovingSkillsUsageActivity({
  workspaceId,
  conversationIds,
}: {
  workspaceId: string;
  conversationIds: string[];
}): Promise<{
  conversationsProcessed: number;
  usagesCreated: number;
  totalPriceMicroUsd: number;
}> {
  const uniqueConversationIds = [...new Set(conversationIds)];
  if (uniqueConversationIds.length === 0) {
    return {
      conversationsProcessed: 0,
      usagesCreated: 0,
      totalPriceMicroUsd: 0,
    };
  }

  const auth = await getAuthForWorkspace(workspaceId);
  const workspace = auth.getNonNullableWorkspace();

  const conversations = await ConversationResource.fetchByIds(
    auth,
    uniqueConversationIds
  );

  const conversationsWithSkills = conversations
    .map((conversation) => ({
      conversation,
      skillIds: getReinforcedSkillIdsFromMetadata(conversation.metadata),
    }))
    .filter(({ skillIds }) => skillIds.length > 0);

  const conversationModelIds = conversationsWithSkills.map(
    ({ conversation }) => conversation.id
  );

  if (conversationModelIds.length === 0) {
    return {
      conversationsProcessed: 0,
      usagesCreated: 0,
      totalPriceMicroUsd: 0,
    };
  }

  const messages = await MessageModel.findAll({
    where: {
      workspaceId: workspace.id,
      conversationId: { [Op.in]: conversationModelIds },
      agentMessageId: { [Op.ne]: null },
    },
    attributes: ["conversationId"],
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: ["runIds"],
      },
    ],
  });

  const runIdsByConversationModelId = new Map<number, Set<string>>();
  for (const message of messages) {
    const runIds = message.agentMessage?.runIds ?? [];
    if (runIds.length === 0) {
      continue;
    }

    const runIdsForConversation =
      runIdsByConversationModelId.get(message.conversationId) ??
      new Set<string>();
    for (const runId of runIds) {
      runIdsForConversation.add(runId);
    }
    runIdsByConversationModelId.set(
      message.conversationId,
      runIdsForConversation
    );
  }

  const allDustRunIds = [
    ...new Set(
      [...runIdsByConversationModelId.values()].flatMap((runIds) => [...runIds])
    ),
  ];

  const runCostMicroUsdByDustRunId = new Map<string, number>();
  if (allDustRunIds.length > 0) {
    const runs = await RunResource.listByDustRunIds(auth, {
      dustRunIds: allDustRunIds,
    });
    const runByModelId = new Map(runs.map((run) => [run.id, run]));
    const runUsages = await RunResource.listRunUsagesForRuns(auth, { runs });

    for (const usage of runUsages) {
      const dustRunId = runByModelId.get(usage.runModelId)?.dustRunId;
      if (!dustRunId) {
        continue;
      }

      runCostMicroUsdByDustRunId.set(
        dustRunId,
        (runCostMicroUsdByDustRunId.get(dustRunId) ?? 0) + usage.costMicroUsd
      );
    }
  }

  const allSkillIds = [
    ...new Set(conversationsWithSkills.flatMap(({ skillIds }) => skillIds)),
  ];
  const skills = await SkillResource.fetchByIds(auth, allSkillIds);
  const skillModelIdById = new Map(
    skills
      .filter((skill) => isResourceSId("skill", skill.sId))
      .map((skill) => [skill.sId, skill.id])
  );

  const usages: SelfImprovingSkillsUsageCreateBlob[] = [];
  let totalPriceMicroUsd = 0;

  for (const { conversation, skillIds } of conversationsWithSkills) {
    const dustRunIds =
      runIdsByConversationModelId.get(conversation.id) ?? new Set<string>();
    const conversationPriceMicroUsd = [...dustRunIds].reduce(
      (sum, dustRunId) =>
        sum + (runCostMicroUsdByDustRunId.get(dustRunId) ?? 0),
      0
    );

    if (conversationPriceMicroUsd <= 0) {
      continue;
    }

    totalPriceMicroUsd += conversationPriceMicroUsd;
    // A single conversation being analysed can have several skill enabled it it
    // In that case we split the cost of analysis evenly per skill.
    const prices = splitPriceMicroUsdAcrossSkills(
      conversationPriceMicroUsd,
      skillIds.length
    );

    for (let i = 0; i < skillIds.length; i++) {
      usages.push({
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        skillId: skillModelIdById.get(skillIds[i]) ?? null,
        conversationId: conversation.id,
        priceMicroUsd: prices[i],
      });
    }
  }

  const createdUsages =
    await SelfImprovingSkillsUsageResource.replaceForConversations(auth, {
      conversationModelIds,
      usages,
    });

  logger.info(
    {
      workspaceId,
      conversationCount: conversationModelIds.length,
      usageCount: createdUsages.length,
      totalPriceMicroUsd,
    },
    "ReinforcedSkills: recorded self-improving skills usage"
  );

  return {
    conversationsProcessed: conversationModelIds.length,
    usagesCreated: createdUsages.length,
    totalPriceMicroUsd,
  };
}

/**
 * Checks reinforcement settings for this workspace:
 * - whether reinforcement is enabled at all
 * - whether batch mode is allowed
 */
export async function getReinforcementSettingsActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<
  | { reinforcementEnabled: false }
  | {
      reinforcementEnabled: true;
      batchModeAllowed: boolean;
      globalConsumptionMicroUsd: number;
      globalCapMicroUsd: number;
      programmaticUsageLimitReached: boolean;
      maxConversationsForBudget: number;
    }
> {
  const auth = await getAuthForWorkspace(workspaceId);
  const reinforcementEnabled = await hasReinforcementEnabled(auth);
  if (!reinforcementEnabled) {
    return { reinforcementEnabled: false };
  }

  const workspace = auth.getNonNullableWorkspace();
  const { cycleStart: periodStart } = await getCurrentPeriod(auth);
  const globalConsumptionMicroUsd =
    await SelfImprovingSkillsUsageResource.getSumPriceMicroUsdAfterDate(
      auth,
      periodStart
    );
  const globalCapMicroUsd = getReinforcementMonthlyCapMicroUsd(workspace);

  const plan = auth.subscription()?.plan;
  const programmaticUsageLimitReached =
    !!plan && isCreditPricedPlan(plan) && !!workspace.metronomeCustomerId
      ? // If the workspace pool is depleted, no downstream message can be posted.
        await isApiBlocked(workspace.sId)
      : // Legacy check
        (await checkProgrammaticUsageLimits(auth)).isErr();

  // Compute remaining programmatic budget: total remaining credits capped by
  // the daily usage allowance.
  // TODO(fabien): use credit pool remaining credit here too.
  const remainingCreditsMicroUsd =
    await CreditResource.getRemainingMicroUsd(auth);
  const remainingDailyCapMicroUsd = await getRemainingDailyCapMicroUsd(auth);
  const remainingProgrammaticCreditsMicroUsd = Math.min(
    remainingCreditsMicroUsd,
    remainingDailyCapMicroUsd
  );

  logger.info(
    {
      workspaceId,
      globalConsumptionMicroUsd,
      globalCapMicroUsd,
      capReached: globalConsumptionMicroUsd >= globalCapMicroUsd,
      programmaticUsageLimitReached,
      remainingProgrammaticCreditsMicroUsd,
    },
    "ReinforcedSkills: workspace consumption check"
  );

  return {
    reinforcementEnabled: true,
    batchModeAllowed: await isReinforcementBatchModeAllowed(auth),
    globalConsumptionMicroUsd,
    globalCapMicroUsd,
    programmaticUsageLimitReached,
    maxConversationsForBudget: getMaxConversationsForBudget({
      globalConsumptionMicroUsd,
      globalCapMicroUsd,
      remainingProgrammaticCreditsMicroUsd,
    }),
  };
}

/**
 * Discover recent conversations that used skills.
 */
export async function getRecentConversationsWithSkillsActivity({
  workspaceId,
  lookbackDays = DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  skillId,
}: {
  workspaceId: string;
  lookbackDays?: number;
  maxConversations?: number;
  skillId?: string;
}): Promise<{ conversationId: string; skillIds: string[] }[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  return findConversationsWithSkills(auth, {
    cutoffDate,
    maxConversations,
    skillId,
  });
}

/**
 * Analyze a single conversation step for skill reinforcement.
 *
 * On the first step (`reinforcementConversationId` is undefined), creates a
 * reinforcement conversation and stores the analysis prompt as the user message.
 *
 * On continuation steps, the reinforcement conversation already contains the full
 * history. The conversation is rendered from DB via `renderConversationForModel`.
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute tools.
 */
export async function analyzeConversationStepActivity({
  workspaceId,
  conversationId,
  skillIds,
  reinforcementConversationId,
}: {
  workspaceId: string;
  conversationId: string;
  skillIds: string[];
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  // On first step, build the analysis prompt and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const [conversationRes, skills] = await Promise.all([
      renderConversationAsTextWithFeedback(auth, {
        conversationId,
        includeActionDetails: true,
      }),
      SkillResource.fetchByIds(auth, skillIds),
    ]);
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId },
        "ReinforcedSkills: conversation not found for step activity"
      );
      return {
        isTerminal: true,
        suggestionsCreated: 0,
        approvedSourceSuggestionIds: [],
      };
    }

    if (skills.length === 0) {
      logger.warn(
        { conversationId, skillIds },
        "ReinforcedSkills: no skills found for step activity"
      );
      return {
        isTerminal: true,
        suggestionsCreated: 0,
        approvedSourceSuggestionIds: [],
      };
    }

    const skillTypes = skills.map((s) => s.toJSON(auth));

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt,
        operationType: "reinforcement_analyze_conversation",
        contextId: conversationId,
        skillIds: skillIds,
      }
    );
  }

  // Fetch the source conversation for FK reference in suggestions.
  const conversation =
    (await ConversationResource.fetchById(auth, conversationId)) ?? undefined;

  const result = await runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforcement_analyze_conversation",
    systemPrompt: buildSkillAnalysisSystemPrompt(),
    contextId: conversationId,
    source: "synthetic",
    conversation,
    eligibleSkillIds: skillIds,
  });
  return { ...result, reinforcementConversationId };
}

/**
 * Find skills that have pending synthetic suggestions ready for aggregation.
 */
export async function getSkillsWithSyntheticSuggestionsActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId?: string;
}): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  // Fetch all pending synthetic suggestions for the workspace (or scoped skill),
  // then extract distinct skill sIds.
  const filters: Parameters<
    typeof SkillSuggestionResource.listBySkillConfigurationId
  >[2] = {
    sources: ["synthetic"],
    states: ["pending"],
  };

  if (skillId) {
    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(
        auth,
        skillId,
        filters
      );
    return suggestions.length > 0 ? [skillId] : [];
  }

  // Single query: list all pending synthetic suggestions across the workspace.
  const allSuggestions = await SkillSuggestionResource.listByWorkspace(
    auth,
    filters
  );

  return [...new Set(allSuggestions.map((s) => s.skillConfigurationSId))];
}

/**
 * Single step of aggregation for a specific skill (streaming mode).
 *
 * On the first step, loads the aggregation context and creates a reinforcement conversation.
 * On continuation steps, re-renders from DB (which includes previous tool results).
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute exploratory tools.
 */
export async function aggregateSuggestionsForSkillStepActivity({
  workspaceId,
  skillId,
  reinforcementConversationId,
}: {
  workspaceId: string;
  skillId: string;
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  // On first step, load aggregation context and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const ctx = await loadSkillAggregationContext(auth, skillId);
    if (!ctx) {
      return {
        isTerminal: true,
        suggestionsCreated: 0,
        approvedSourceSuggestionIds: [],
      };
    }

    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt: ctx.prompt,
        operationType: "reinforcement_aggregate_suggestions",
        contextId: skillId,
        skillIds: [skillId],
      }
    );
  }

  const result = await runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforcement_aggregate_suggestions",
    systemPrompt: buildSkillAggregationSystemPrompt(),
    contextId: skillId,
    source: "reinforcement",
    eligibleSkillIds: [skillId],
  });
  return { ...result, reinforcementConversationId };
}

/**
 * Finalize aggregation for a skill: delete synthetic suggestions (they have been
 * consolidated into reinforcement suggestions).
 */
export async function finalizeSkillAggregationActivity({
  workspaceId,
  skillId,
  suggestionsCreated,
  approvedSourceSuggestionIds,
  disableNotifications,
}: {
  workspaceId: string;
  skillId: string;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  // Mark only the synthetic suggestions that were used by edit_skill as approved.
  // Rejected ones were already marked during processing; the rest stay pending.
  if (approvedSourceSuggestionIds.length > 0) {
    const approvedSuggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      approvedSourceSuggestionIds
    );
    await SkillSuggestionResource.bulkUpdateState(
      auth,
      approvedSuggestions,
      "approved"
    );
  }

  // Record that reinforcement analysis has completed for this skill.
  const skill = await SkillResource.fetchById(auth, skillId);
  if (!skill) {
    throw new Error(`Skill not found: ${skillId}`);
  }
  await skill.recordReinforcementAnalysisCompletion();

  const hasReinforcementUi = await hasFeatureFlag(auth, "reinforcement_ui");

  if (suggestionsCreated > 0 && !disableNotifications && hasReinforcementUi) {
    const skillType = skill.toJSON(auth);
    const editors = (await skill.listEditors(auth)) ?? [];
    const editorTypes = editors.map((e) => e.toJSON());

    notifySkillSuggestionsReady(auth, {
      skillId: skillType.sId,
      skillName: skillType.name,
      editors: editorTypes,
      suggestionCount: suggestionsCreated,
    });
    await createSkillSuggestionsConversation(auth, skill, editorTypes);
  }

  logger.info(
    {
      skillId,
      approvedCount: approvedSourceSuggestionIds.length,
      pendingCreated: suggestionsCreated,
      disableNotifications,
    },
    "ReinforcedSkills: finalized skill aggregation"
  );
}

/**
 * Check the status of a batch.
 */
export async function checkBatchStatusActivity({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<BatchStatus> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation",
    { forBatch: true }
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedSkills: no LLM available for batch status check"
    );
  }

  return llm.getBatchStatus(batchId);
}

export interface ConversationContinuationInfo {
  analysedConversationId: string;
  reinforcementConversationId: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}

/**
 * Build analysis prompts for skill conversations and submit as a batch.
 * For first-time conversations, builds prompts via buildSkillConversationAnalysisBatchMap.
 * For continuation conversations, reuses existing reinforcement conversations.
 */
export async function startSkillConversationAnalysisBatchActivity({
  workspaceId,
  conversationsWithSkills,
  existingReinforcementConversationMap,
}: {
  workspaceId: string;
  conversationsWithSkills: { conversationId: string; skillIds: string[] }[];
  existingReinforcementConversationMap?: Record<string, string>;
}): Promise<{
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation",
    { forBatch: true }
  );
  if (!llm) {
    logger.warn(
      { workspaceId },
      "ReinforcedSkills: no LLM available for conversation analysis batch"
    );
    return null;
  }

  // Build the analysis prompt for first-time conversations.
  const firstTimeConversations = conversationsWithSkills.filter(
    (c) => !existingReinforcementConversationMap?.[c.conversationId]
  );

  let batchMap: Map<string, LLMStreamParameters> | null = null;
  if (firstTimeConversations.length > 0) {
    batchMap = await buildSkillConversationAnalysisBatchMap(
      auth,
      firstTimeConversations
    );
  }

  const systemPrompt = buildSkillAnalysisSystemPrompt();
  const specifications = buildReinforcedSkillsSpecifications(
    "reinforcement_analyze_conversation"
  );

  const batchConversations: LlmConversationOptions[] = [];
  const orderedAnalysedConversationIds: string[] = [];

  for (const { conversationId, skillIds } of conversationsWithSkills) {
    const existingReinforcementConvId =
      existingReinforcementConversationMap?.[conversationId];

    if (existingReinforcementConvId) {
      // Continuation: reuse existing reinforcement conversation.
      batchConversations.push({
        newMessages: [],
        existingConversationId: existingReinforcementConvId,
        prompt: systemPrompt,
        specifications,
        userContextOrigin: "reinforcement",
      });
      orderedAnalysedConversationIds.push(conversationId);
    } else {
      // First time: create a new reinforcement conversation with the analysis prompt.
      const llmParams = batchMap?.get(conversationId);
      if (!llmParams) {
        continue;
      }
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcedSkillsConversationTitle(
          "reinforcement_analyze_conversation",
          conversationId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcedSkillsDefaultOptions(
          "reinforcement_analyze_conversation",
          skillIds
        ),
      });
      orderedAnalysedConversationIds.push(conversationId);
    }
  }

  if (batchConversations.length === 0) {
    return null;
  }

  const result = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (result.isErr()) {
    throw result.error;
  }
  if (!result.value) {
    return null;
  }

  // Build the map of analysed conversation ID -> reinforcement conversation ID.
  // Conversations skipped by sendBatchCallToLlm (e.g. context window exceeded)
  // appear as null in conversationIds and are dropped from the map.
  const reinforcementConversationMap: Record<string, string> = {
    ...(existingReinforcementConversationMap ?? {}),
  };
  for (let i = 0; i < orderedAnalysedConversationIds.length; i++) {
    const conversationId = result.value.conversationIds[i];
    if (conversationId !== null) {
      reinforcementConversationMap[orderedAnalysedConversationIds[i]] =
        conversationId;
    }
  }

  logger.info(
    {
      workspaceId,
      batchId: result.value.batchId,
      conversationCount: batchConversations.length,
      continuationCount: Object.keys(existingReinforcementConversationMap ?? {})
        .length,
    },
    "ReinforcedSkills: started conversation analysis batch"
  );

  return {
    batchId: result.value.batchId,
    reinforcementConversationMap,
  };
}

/**
 * Download batch results for skill conversation analysis and create suggestions.
 * For conversations where the LLM called only terminal tools, creates suggestions.
 * For conversations where the LLM called exploratory tools, returns continuation info.
 */
export async function processSkillConversationAnalysisBatchResultActivity({
  workspaceId,
  batchId,
  reinforcementConversationMap,
  conversationSkillMap,
}: {
  workspaceId: string;
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
  // mapping from analysed conversation id to analysed skill ids
  conversationSkillMap: Record<string, string[]>;
}): Promise<ConversationContinuationInfo[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation",
    { forBatch: true }
  );
  if (!llm) {
    return [];
  }

  // Invert the map: reinforcementConvId -> analysedConvId.
  const reinforcementToAnalysed = new Map<string, string>();
  const reinforcementConversationIds: string[] = [];
  for (const [analysedId, reinforcementId] of Object.entries(
    reinforcementConversationMap
  )) {
    reinforcementToAnalysed.set(reinforcementId, analysedId);
    reinforcementConversationIds.push(reinforcementId);
  }

  // Download results and store agent messages in reinforcement conversations.
  const { events: batchEvents, storedResultInfo } =
    await downloadBatchResultFromLlm(
      auth,
      llm,
      batchId,
      reinforcementConversationIds,
      REINFORCEMENT_SKILLS_AGENT_ID
    );

  // Resolve analysed conversations for FK storage.
  const analysedConversationIds = Object.keys(reinforcementConversationMap);
  const analysedConversations = await ConversationResource.fetchByIds(
    auth,
    analysedConversationIds
  );
  const conversationById = new Map(
    analysedConversations.map((c) => [c.sId, c])
  );

  const reinforcementConversations = await ConversationResource.fetchByIds(
    auth,
    reinforcementConversationIds
  );
  const reinforcementConvById = new Map(
    reinforcementConversations.map((c) => [c.sId, c])
  );

  // Report usage to billing channels for each stored result (fire-and-forget).
  await concurrentExecutor(
    [...storedResultInfo],
    ([convId, info]) =>
      reportSelfImprovingSkillsStepUsage({
        auth,
        reinforcementConversationId: convId,
        conversationTitle: reinforcementConvById.get(convId)?.title ?? null,
        agentMessageId: info.agentMessageId,
        userMessageId: info.userMessageId,
      }),
    { concurrency: 4 }
  );

  let totalCreated = 0;
  const continuations: ConversationContinuationInfo[] = [];

  for (const [reinforcementConvId, events] of batchEvents) {
    const analysedConvId =
      reinforcementToAnalysed.get(reinforcementConvId) ?? reinforcementConvId;

    const reinforcementConv = reinforcementConvById.get(reinforcementConvId);
    if (!reinforcementConv) {
      logger.warn(
        { reinforcementConvId, batchId },
        "ReinforcedSkills: reinforcement conversation not found, skipping"
      );
      continue;
    }

    const { exploratoryToolCalls, terminalToolCalls } =
      classifySkillToolCalls(events);

    // If terminal tools were called, process suggestions.
    if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
      const result = await processSkillReinforcedEvents({
        auth,
        events,
        source: "synthetic",
        operationType: "reinforcement_analyze_conversation",
        contextId: analysedConvId,
        conversation: conversationById.get(analysedConvId),
        eligibleSkillIds: conversationSkillMap[analysedConvId] ?? [],
      });
      totalCreated += result.suggestionsCreated;

      // Store results for all terminal tool calls so the conversation is complete.
      const storedInfo = storedResultInfo.get(reinforcementConvId);
      if (storedInfo) {
        await storeTerminalToolCallResults(auth, {
          conversation: reinforcementConv.toJSON(),
          successfulToolCalls: result.successfulToolCalls,
          failedToolCalls: result.failedToolCalls,
          agentMessageModelId: storedInfo.agentMessageModelId,
        });

        // If any failed, add to continuations so the LLM can retry.
        if (result.failedToolCalls.length > 0) {
          continuations.push({
            analysedConversationId: analysedConvId,
            reinforcementConversationId: reinforcementConvId,
          });
        }
      }
    } else {
      // Only exploratory tools — prepare actions for the workflow to execute.
      const storedInfo = storedResultInfo.get(reinforcementConvId);
      if (storedInfo) {
        const toolActionInfo = await prepareReinforcedToolActions(auth, {
          conversation: reinforcementConv.toJSON(),
          exploratoryToolCalls,
          agentMessageModelId: storedInfo.agentMessageModelId,
          agentMessageId: storedInfo.agentMessageId,
          userMessageId: storedInfo.userMessageId,
        });

        continuations.push({
          analysedConversationId: analysedConvId,
          reinforcementConversationId: reinforcementConvId,
          toolActionInfo,
        });
      }
    }
  }

  logger.info(
    {
      batchId,
      conversationCount: batchEvents.size,
      suggestionsCreated: totalCreated,
      continuationCount: continuations.length,
    },
    "ReinforcedSkills: processed conversation analysis batch results"
  );

  return continuations;
}

/**
 * Build aggregation prompt for a skill and submit as a batch.
 * Returns the batch ID and reinforcement conversation IDs,
 * or null if there are no suggestions to aggregate.
 */
export async function startSkillAggregationBatchActivity({
  workspaceId,
  skillId,
  existingReinforcementConversationId,
}: {
  workspaceId: string;
  skillId: string;
  existingReinforcementConversationId?: string;
}): Promise<{
  batchId: string;
  reinforcementConversationIds: string[];
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_aggregate_suggestions",
    { forBatch: true }
  );
  if (!llm) {
    logger.warn(
      { workspaceId, skillId },
      "ReinforcedSkills: no LLM available for aggregation batch"
    );
    return null;
  }

  const systemPrompt = buildSkillAggregationSystemPrompt();
  const specifications = buildReinforcedSkillsSpecifications(
    "reinforcement_aggregate_suggestions"
  );

  let batchConversations: LlmConversationOptions[];

  if (existingReinforcementConversationId) {
    // Continuation: reuse existing reinforcement conversation.
    batchConversations = [
      {
        newMessages: [],
        existingConversationId: existingReinforcementConversationId,
        prompt: systemPrompt,
        specifications,
        ...getReinforcedSkillsDefaultOptions(
          "reinforcement_aggregate_suggestions",
          [skillId]
        ),
      },
    ];
  } else {
    // First time: build the aggregation prompt.
    const batchMap = await buildSkillAggregationBatchMap(auth, skillId);
    if (!batchMap) {
      return null;
    }

    batchConversations = [];
    for (const [, llmParams] of batchMap) {
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcedSkillsConversationTitle(
          "reinforcement_aggregate_suggestions",
          skillId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcedSkillsDefaultOptions(
          "reinforcement_aggregate_suggestions",
          [skillId]
        ),
      });
    }
  }

  const sendResult = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (sendResult.isErr()) {
    throw sendResult.error;
  }
  if (!sendResult.value) {
    return null;
  }
  const { batchId, conversationIds } = sendResult.value;

  logger.info(
    {
      skillId,
      workspaceId,
      batchId,
    },
    "ReinforcedSkills: started aggregation batch"
  );

  // Drop null entries (conversations skipped by sendBatchCallToLlm).
  return {
    batchId,
    reinforcementConversationIds: conversationIds.filter(
      (id): id is string => id !== null
    ),
  };
}

/**
 * Download aggregation batch results and process tool calls.
 * Returns `needsContinuation: true` with `toolActionInfo` when the LLM called
 * exploratory tools (or terminal tools failed). Returns `needsContinuation: false`
 * when terminal tools succeeded.
 */
export async function processSkillAggregationBatchResultActivity({
  workspaceId,
  skillId,
  batchId,
  reinforcementConversationIds,
}: {
  workspaceId: string;
  skillId: string;
  batchId: string;
  reinforcementConversationIds: string[];
}): Promise<{
  needsContinuation: boolean;
  suggestionsCreated: number;
  approvedSourceSuggestionIds: string[];
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_aggregate_suggestions",
    { forBatch: true }
  );
  if (!llm) {
    return {
      needsContinuation: false,
      suggestionsCreated: 0,
      approvedSourceSuggestionIds: [],
    };
  }

  // Download results and store agent messages in reinforcement conversations.
  const { events: batchEvents, storedResultInfo } =
    await downloadBatchResultFromLlm(
      auth,
      llm,
      batchId,
      reinforcementConversationIds,
      REINFORCEMENT_SKILLS_AGENT_ID
    );

  // The aggregation batch has a single entry — get the first result.
  const firstConvId = reinforcementConversationIds[0];
  const events = batchEvents.get(firstConvId);

  if (!events) {
    return {
      needsContinuation: false,
      suggestionsCreated: 0,
      approvedSourceSuggestionIds: [],
    };
  }

  // Hydrate the reinforcement conversation from its sId so we can pass
  // ConversationWithoutContentType to action helpers (activity inputs are frozen).
  const reinforcementConv = await ConversationResource.fetchById(
    auth,
    firstConvId
  );
  if (!reinforcementConv) {
    throw new Error(`Reinforcement conversation not found: ${firstConvId}`);
  }

  // Report usage to billing channels for each stored result (fire-and-forget).
  await concurrentExecutor(
    [...storedResultInfo],
    ([convId, info]) =>
      reportSelfImprovingSkillsStepUsage({
        auth,
        reinforcementConversationId: convId,
        conversationTitle: reinforcementConv.title,
        agentMessageId: info.agentMessageId,
        userMessageId: info.userMessageId,
      }),
    { concurrency: 4 }
  );

  const { exploratoryToolCalls, terminalToolCalls } =
    classifySkillToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    const result = await processSkillReinforcedEvents({
      auth,
      events,
      source: "reinforcement",
      operationType: "reinforcement_aggregate_suggestions",
      contextId: skillId,
      eligibleSkillIds: [skillId],
    });

    // Store results for all terminal tool calls.
    const storedInfo = storedResultInfo.get(firstConvId);
    if (storedInfo) {
      await storeTerminalToolCallResults(auth, {
        conversation: reinforcementConv.toJSON(),
        successfulToolCalls: result.successfulToolCalls,
        failedToolCalls: result.failedToolCalls,
        agentMessageModelId: storedInfo.agentMessageModelId,
      });

      // If any failed, continue the loop for retry.
      if (result.failedToolCalls.length > 0) {
        return {
          needsContinuation: true,
          suggestionsCreated: result.suggestionsCreated,
          approvedSourceSuggestionIds: result.approvedSourceSuggestionIds,
          reinforcementConversationId: firstConvId,
        };
      }
    }

    logger.info(
      {
        skillId,
        batchId,
        suggestionsCreated: result.suggestionsCreated,
      },
      "ReinforcedSkills: processed aggregation batch results"
    );

    return {
      needsContinuation: false,
      suggestionsCreated: result.suggestionsCreated,
      approvedSourceSuggestionIds: result.approvedSourceSuggestionIds,
    };
  }

  // Only exploratory tools — prepare actions for the workflow to execute.
  const storedInfo = storedResultInfo.get(firstConvId);
  if (!storedInfo) {
    return {
      needsContinuation: false,
      suggestionsCreated: 0,
      approvedSourceSuggestionIds: [],
    };
  }

  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    conversation: reinforcementConv.toJSON(),
    exploratoryToolCalls,
    agentMessageModelId: storedInfo.agentMessageModelId,
    agentMessageId: storedInfo.agentMessageId,
    userMessageId: storedInfo.userMessageId,
  });

  return {
    needsContinuation: true,
    suggestionsCreated: 0,
    approvedSourceSuggestionIds: [],
    reinforcementConversationId: firstConvId,
    toolActionInfo,
  };
}

// ---------------------------------------------------------------------------
// Ensure schedules activity
// ---------------------------------------------------------------------------

export async function ensureReinforcementWorkspaceSchedulesActivity(): Promise<{
  started: string[];
  stopped: string[];
}> {
  return ensureReinforcementWorkspaceSchedules();
}
