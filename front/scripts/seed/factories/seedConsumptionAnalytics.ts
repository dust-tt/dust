import { upsertAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/store";
import { listConsumptionFacetCatalog } from "@app/lib/api/analytics/consumption/facet_catalog";
import { normalizeOrigin } from "@app/lib/api/analytics/source_labels";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import {
  CONSUMPTION_ANALYTICS_ALIAS_NAME,
  withEs,
} from "@app/lib/api/elasticsearch";
import {
  microCreditsToCredits,
  roundCreditsToMicroCredits,
} from "@app/lib/credits/units";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { GroupResource } from "@app/lib/resources/group_resource";
import type {
  AgentMessageConsumptionAnalyticsAgent,
  AgentMessageConsumptionAnalyticsData,
  AgentMessageConsumptionAnalyticsLlmData,
  AgentMessageConsumptionAnalyticsToolData,
  AgentMessageConsumptionAnalyticsUser,
} from "@app/types/assistant/analytics";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import type { ModelConfigurationType } from "@app/types/assistant/models/types";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import { ONE_DAY_MS, ONE_HOUR_MS } from "@app/types/shared/utils/date_utils";
import { removeNulls } from "@app/types/shared/utils/general";

import type { SeedContext } from "./types";

/**
 * Seeds the consumption index the "Analytics" page reads, with the
 * documents the attribution pipeline would have produced for billed LLM steps
 * and tool calls.
 *
 * Every dimension of the page (agent, member, team, model, tool, skill, source)
 * is filled from the workspace's own facet catalog, so the values the filter
 * panel offers are exactly the ones the seeded documents carry.
 */

// Keeps a second run overwriting the first run's documents instead of doubling them.
const SEED_CONSUMPTION_KEY_PREFIX = "seed-consumption";

const DEFAULT_DAYS_BACK = 90;
const DEFAULT_MESSAGES_PER_DAY = 12;
const BULK_CHUNK_SIZE = 500;

const LLM_CREDIT_RANGE = { min: 0.2, max: 8 };
const TOOL_DIRECT_CREDIT_RANGE = { min: 0.01, max: 0.4 };
const TOOL_MODEL_CREDIT_RANGE = { min: 0.01, max: 0.2 };
const MAX_LLM_STEPS = 3;
const MAX_TOOL_CALLS = 3;
// Share of messages that delegate to a sub-agent.
const SUB_AGENT_RATE = 0.15;
// Messages land between these hours, so the daily buckets of the chart are not
// perfectly flat.
const FIRST_HOUR_UTC = 7;
const LAST_HOUR_UTC = 20;

// Automations are a third of the workspace's consumption, so the Automation
// page has a ranking with a head and a tail rather than a handful of rows.
const ORIGIN_WEIGHTS: { origin: UserMessageOrigin; weight: number }[] = [
  { origin: "web", weight: 40 },
  { origin: "triggered", weight: 22 },
  { origin: "slack", weight: 12 },
  { origin: "slack_workflow", weight: 5 },
  { origin: "triggered_programmatic", weight: 8 },
  { origin: "api", weight: 7 },
  { origin: "extension", weight: 5 },
  { origin: "cli_programmatic", weight: 3 },
  { origin: "gsheet", weight: 2 },
  { origin: "email", weight: 1 },
];

const PROGRAMMATIC_ORIGINS: UserMessageOrigin[] = [
  "api",
  "cli_programmatic",
  "triggered_programmatic",
];

const TRIGGERED_ORIGINS: UserMessageOrigin[] = [
  "triggered",
  "triggered_programmatic",
];

export interface SeedConsumptionAnalyticsOptions {
  daysBack?: number;
  messagesPerDay?: number;
  triggerIds?: string[];
}

// Deterministic PRNG (mulberry32): the same workspace always gets the same
// dataset, which keeps re-runs idempotent and screenshots comparable.
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Random = () => number;

function randomInt(random: Random, min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function randomCredits(
  random: Random,
  { min, max }: { min: number; max: number }
): number {
  return min + random() * (max - min);
}

function pick<T>(random: Random, items: T[]): T {
  return items[randomInt(random, 0, items.length - 1)];
}

// Weighted towards the head of the list: the rankings need heavy hitters and a
// long tail, and the chart an "others" series.
function pickByRank<T>(random: Random, items: T[]): T {
  const weights = items.map((_, index) => 1 / (index + 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = random() * total;
  for (const [index, weight] of weights.entries()) {
    target -= weight;
    if (target <= 0) {
      return items[index];
    }
  }
  return items[items.length - 1];
}

function pickOrigin(random: Random): UserMessageOrigin {
  const total = ORIGIN_WEIGHTS.reduce((sum, { weight }) => sum + weight, 0);
  let target = random() * total;
  for (const { origin, weight } of ORIGIN_WEIGHTS) {
    target -= weight;
    if (target <= 0) {
      return origin;
    }
  }
  return "web";
}

function seedId(prefix: string, index: number): string {
  return `${prefix}${index.toString().padStart(6, "0")}`;
}

type ConsumptionPools = {
  agentIds: string[];
  users: AgentMessageConsumptionAnalyticsUser[];
  models: ModelConfigurationType[];
  toolServerNames: string[];
  skillIds: string[];
  triggerIds: string[];
};

async function loadConsumptionPools(
  ctx: SeedContext,
  triggerIds: string[]
): Promise<ConsumptionPools> {
  const { auth } = ctx;

  const catalog = await listConsumptionFacetCatalog(auth);

  // Real memberships, so the Teams tab matches the workspace.
  const groups = await GroupResource.listAllWorkspaceGroups(auth, {
    groupKinds: [...CAP_ELIGIBLE_GROUP_KINDS],
  });
  const groupsWithMembers = await GroupResource.fetchJSONWithMembers(
    auth,
    groups
  );
  const groupIdsByUserId = new Map<string, string[]>();
  for (const group of groupsWithMembers) {
    for (const memberId of group.memberIds) {
      groupIdsByUserId.set(memberId, [
        ...(groupIdsByUserId.get(memberId) ?? []),
        group.sId,
      ]);
    }
  }

  return {
    agentIds: catalog.agent.map((entry) => entry.value),
    users: catalog.user.map((entry) => ({
      id: entry.value,
      group_ids: [...(groupIdsByUserId.get(entry.value) ?? [])].sort(),
    })),
    models: removeNulls(
      catalog.model.map((entry) => getModelConfigByModelId(entry.value) ?? null)
    ),
    toolServerNames: catalog.tool.map((entry) => entry.value),
    skillIds: catalog.skill.map((entry) => entry.value),
    triggerIds,
  };
}

type SeedMessage = {
  agent: AgentMessageConsumptionAnalyticsAgent;
  agentMessageId: string;
  completedAt: Date;
  conversationId: string;
  llmStepCount: number;
  model: ModelConfigurationType;
  origin: UserMessageOrigin;
  toolCallCount: number;
  triggerId: string | null;
  user: AgentMessageConsumptionAnalyticsUser;
};

function makeAgent(
  agentId: string,
  parentAgentId?: string
): AgentMessageConsumptionAnalyticsAgent {
  return {
    attributed_id: agentId,
    id: agentId,
    version: "0",
    tag_ids: [],
    parent_ids: parentAgentId ? [parentAgentId] : [],
    direct_parent_id: parentAgentId ?? null,
    root_id: parentAgentId ?? agentId,
    depth: parentAgentId ? 1 : 0,
  };
}

function planDayMessages(
  random: Random,
  pools: ConsumptionPools,
  {
    dayStartMs,
    messageCount,
    nowMs,
    startIndex,
  }: {
    dayStartMs: number;
    messageCount: number;
    nowMs: number;
    startIndex: number;
  }
): SeedMessage[] {
  const messages: SeedMessage[] = [];

  for (let i = 0; i < messageCount; i++) {
    const index = startIndex + messages.length;
    const completedAtMs = Math.min(
      dayStartMs +
        randomInt(random, FIRST_HOUR_UTC, LAST_HOUR_UTC) * ONE_HOUR_MS +
        randomInt(random, 0, 59) * 60 * 1000,
      nowMs
    );
    const agentId = pickByRank(random, pools.agentIds);
    const conversationId = seedId("seedconv", index);
    const origin = pickOrigin(random);
    // The trigger lives on the conversation, so every message of a triggered
    // run carries the same one.
    const shared = {
      completedAt: new Date(completedAtMs),
      conversationId,
      model: pickByRank(random, pools.models),
      origin,
      triggerId:
        TRIGGERED_ORIGINS.includes(origin) && pools.triggerIds.length > 0
          ? pickByRank(random, pools.triggerIds)
          : null,
      user: pickByRank(random, pools.users),
    };

    messages.push({
      ...shared,
      agent: makeAgent(agentId),
      agentMessageId: seedId("seedmsg", index),
      llmStepCount: randomInt(random, 1, MAX_LLM_STEPS),
      toolCallCount: randomInt(random, 0, MAX_TOOL_CALLS),
    });

    if (random() < SUB_AGENT_RATE && pools.agentIds.length > 1) {
      messages.push({
        ...shared,
        agent: makeAgent(pick(random, pools.agentIds), agentId),
        agentMessageId: seedId("seedsubmsg", index),
        llmStepCount: randomInt(random, 1, 2),
        toolCallCount: randomInt(random, 0, 2),
      });
    }
  }

  return messages;
}

// Fields both document types carry.
type SeedConsumptionBaseFields = Pick<
  AgentMessageConsumptionAnalyticsData,
  | "agent"
  | "agent_message_id"
  | "api_key_name"
  | "attribution_version"
  | "completed_at"
  | "consumption_key"
  | "context_origin"
  | "conversation_id"
  | "execution_time_ms"
  | "message_version"
  | "model"
  | "normalized_origin"
  | "parent_message_id"
  | "run_usage_id"
  | "space_id"
  | "status"
  | "step_index"
  | "trigger_id"
  | "usage_type"
  | "user"
  | "workspace_id"
>;

function makeBaseFields(
  random: Random,
  message: SeedMessage,
  {
    consumptionKey,
    stepIndex,
    workspaceId,
  }: { consumptionKey: string; stepIndex: number; workspaceId: string }
): SeedConsumptionBaseFields {
  const isProgrammatic = PROGRAMMATIC_ORIGINS.includes(message.origin);

  return {
    agent: message.agent,
    agent_message_id: message.agentMessageId,
    api_key_name: isProgrammatic ? "Seed integration key" : null,
    attribution_version: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    completed_at: message.completedAt.toISOString(),
    consumption_key: consumptionKey,
    context_origin: message.origin,
    conversation_id: message.conversationId,
    execution_time_ms: randomInt(random, 400, 25_000),
    message_version: "0",
    model: {
      provider_id: message.model.providerId,
      model_id: message.model.modelId,
      reasoning_effort: message.model.defaultReasoningEffort,
      resolution_method: "agent",
    },
    normalized_origin: normalizeOrigin(message.origin),
    parent_message_id: null,
    run_usage_id: consumptionKey,
    space_id: null,
    status: "succeeded",
    step_index: stepIndex,
    trigger_id: message.triggerId,
    usage_type: isProgrammatic ? "programmatic" : "user",
    user: message.user,
    workspace_id: workspaceId,
  };
}

function makeLlmDocument(
  random: Random,
  message: SeedMessage,
  { stepIndex, workspaceId }: { stepIndex: number; workspaceId: string }
): AgentMessageConsumptionAnalyticsLlmData {
  const creditMicro = roundCreditsToMicroCredits(
    randomCredits(random, LLM_CREDIT_RANGE)
  );
  const systemCreditMicro = Math.floor(creditMicro * 0.05);
  const outputCreditMicro = Math.floor(creditMicro * 0.35);
  const reasoningCreditMicro = Math.floor(creditMicro * 0.1);

  return {
    ...makeBaseFields(random, message, {
      consumptionKey: `${SEED_CONSUMPTION_KEY_PREFIX}:llm:${stepIndex}`,
      stepIndex,
      workspaceId,
    }),
    consumption_type: "llm",
    credit_micro: creditMicro,
    gross_credit_micro: {
      system: systemCreditMicro,
      input:
        creditMicro -
        systemCreditMicro -
        outputCreditMicro -
        reasoningCreditMicro,
      result_footprint: null,
      output: outputCreditMicro,
      reasoning: reasoningCreditMicro,
      direct: 0,
      total: creditMicro,
    },
    tokens: {
      system: randomInt(random, 200, 1500),
      input: randomInt(random, 800, 90_000),
      result_footprint: null,
      output: randomInt(random, 50, 2000),
      reasoning: randomInt(random, 0, 3000),
    },
    tool: null,
  };
}

function makeToolDocument(
  random: Random,
  message: SeedMessage,
  pools: ConsumptionPools,
  {
    stepIndex,
    toolIndex,
    workspaceId,
  }: { stepIndex: number; toolIndex: number; workspaceId: string }
): AgentMessageConsumptionAnalyticsToolData {
  const directCreditMicro = roundCreditsToMicroCredits(
    randomCredits(random, TOOL_DIRECT_CREDIT_RANGE)
  );
  const creditMicro =
    directCreditMicro +
    roundCreditsToMicroCredits(randomCredits(random, TOOL_MODEL_CREDIT_RANGE));
  const serverName = pickByRank(random, pools.toolServerNames);

  return {
    ...makeBaseFields(random, message, {
      consumptionKey: `${SEED_CONSUMPTION_KEY_PREFIX}:tool:${stepIndex}:${toolIndex}`,
      stepIndex,
      workspaceId,
    }),
    consumption_type: "tool",
    credit_micro: creditMicro,
    gross_credit_micro: {
      system: 0,
      input: null,
      result_footprint: null,
      output: null,
      reasoning: 0,
      direct: directCreditMicro,
      total: creditMicro,
    },
    tokens: {
      system: 0,
      input: null,
      result_footprint: randomInt(random, 200, 12_000),
      output: randomInt(random, 20, 400),
      reasoning: 0,
    },
    tool: {
      // Tool names are not a dimension of the page, only server names are.
      name: `${serverName}_seed_tool`,
      server_name: serverName,
      parent_server_name: "",
      action_id: seedId("seedaction", toolIndex),
      attributed_skill_ids:
        pools.skillIds.length > 0 && random() < 0.6
          ? [pickByRank(random, pools.skillIds)]
          : [],
    },
  };
}

function makeMessageDocuments(
  random: Random,
  message: SeedMessage,
  pools: ConsumptionPools,
  workspaceId: string
): AgentMessageConsumptionAnalyticsData[] {
  const documents: AgentMessageConsumptionAnalyticsData[] = [];

  for (let stepIndex = 0; stepIndex < message.llmStepCount; stepIndex++) {
    documents.push(
      makeLlmDocument(random, message, { stepIndex, workspaceId })
    );
  }

  if (pools.toolServerNames.length === 0) {
    return documents;
  }

  for (let toolIndex = 0; toolIndex < message.toolCallCount; toolIndex++) {
    documents.push(
      makeToolDocument(random, message, pools, {
        // A tool call belongs to the step that emitted it.
        stepIndex: toolIndex % message.llmStepCount,
        toolIndex,
        workspaceId,
      })
    );
  }

  return documents;
}

function planDocuments(
  pools: ConsumptionPools,
  {
    daysBack,
    messagesPerDay,
    workspaceId,
  }: { daysBack: number; messagesPerDay: number; workspaceId: string }
): AgentMessageConsumptionAnalyticsData[] {
  const random = makeRandom(daysBack * 1000 + messagesPerDay);
  const nowMs = Date.now();
  const todayStartMs = Math.floor(nowMs / ONE_DAY_MS) * ONE_DAY_MS;
  const documents: AgentMessageConsumptionAnalyticsData[] = [];
  let messageIndex = 0;

  for (let dayOffset = daysBack - 1; dayOffset >= 0; dayOffset--) {
    const dayStartMs = todayStartMs - dayOffset * ONE_DAY_MS;
    const dayOfWeek = new Date(dayStartMs).getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    // A trend and a weekly rhythm, rather than noise around a flat line.
    const growth = 0.5 + (daysBack - dayOffset) / daysBack;
    const dayMessageCount = Math.max(
      1,
      Math.round(messagesPerDay * growth * (isWeekend ? 0.25 : 1))
    );

    const messages = planDayMessages(random, pools, {
      dayStartMs,
      messageCount: dayMessageCount,
      nowMs,
      startIndex: messageIndex,
    });
    messageIndex += messages.length;

    for (const message of messages) {
      documents.push(
        ...makeMessageDocuments(random, message, pools, workspaceId)
      );
    }
  }

  return documents;
}

export async function seedConsumptionAnalytics(
  ctx: SeedContext,
  {
    daysBack = DEFAULT_DAYS_BACK,
    messagesPerDay = DEFAULT_MESSAGES_PER_DAY,
    triggerIds = [],
  }: SeedConsumptionAnalyticsOptions = {}
): Promise<void> {
  const { workspace, execute, logger } = ctx;

  const pools = await loadConsumptionPools(ctx, triggerIds);
  if (
    pools.agentIds.length === 0 ||
    pools.users.length === 0 ||
    pools.models.length === 0
  ) {
    throw new Error(
      "The workspace has no agent, member or model to attribute consumption to."
    );
  }
  if (pools.toolServerNames.length === 0) {
    logger.warn(
      "No MCP server in the workspace: the Tools and Skills tabs will be empty."
    );
  }
  if (pools.triggerIds.length === 0) {
    logger.warn(
      "No trigger passed in: the triggered consumption will carry no trigger."
    );
  }

  const documents = planDocuments(pools, {
    daysBack,
    messagesPerDay,
    workspaceId: workspace.sId,
  });
  const totalCredits = microCreditsToCredits(
    documents.reduce((sum, document) => sum + document.credit_micro, 0)
  );

  if (!execute) {
    logger.info(
      {
        agentCount: pools.agentIds.length,
        daysBack,
        documentCount: documents.length,
        memberCount: pools.users.length,
        sampleDocument: documents[0],
        totalCredits,
      },
      "Dry run: would index consumption documents"
    );
    return;
  }

  for (let i = 0; i < documents.length; i += BULK_CHUNK_SIZE) {
    const result = await upsertAgentMessageConsumptionAnalyticsDocuments(
      documents.slice(i, i + BULK_CHUNK_SIZE)
    );
    if (result.isErr()) {
      throw result.error;
    }
  }

  // Force a refresh so the page shows the seeded data right away.
  const refreshResult = await withEs((client) =>
    client.indices.refresh({ index: CONSUMPTION_ANALYTICS_ALIAS_NAME })
  );
  if (refreshResult.isErr()) {
    throw refreshResult.error;
  }

  logger.info(
    {
      agentCount: pools.agentIds.length,
      daysBack,
      documentCount: documents.length,
      memberCount: pools.users.length,
      modelCount: pools.models.length,
      skillCount: pools.skillIds.length,
      toolCount: pools.toolServerNames.length,
      totalCredits,
      triggerCount: pools.triggerIds.length,
    },
    "Indexed consumption documents"
  );
}
