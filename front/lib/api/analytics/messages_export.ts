import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import {
  AGENT_MESSAGE_ID_FIELD,
  buildConsumptionScopeQuery,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import {
  fetchAgentMetadata,
  fetchUserEmails,
} from "@app/lib/api/analytics/enrichment";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { SkillConfigurationModel } from "@app/lib/models/skill";
import { AgentMessageSkillModel } from "@app/lib/models/skill/conversation_skill";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/code_defined/global_registry";
import { SystemSkillsRegistry } from "@app/lib/resources/skill/code_defined/system_registry";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import type { WhereOptions } from "sequelize";
import { Op, QueryTypes } from "sequelize";

// Composite aggregation page size for the consumption index credits lookup.
// Large enough that busy workspaces still resolve in a handful of pages.
const CREDITS_COMPOSITE_PAGE_SIZE = 10_000;

export interface MessageExportRow {
  messageId: string;
  createdAt: string;
  assistantId: string;
  assistantName: string;
  assistantSettings: string;
  assistantTags: string;
  conversationId: string;
  parentMessageId: string;
  userId: string;
  userEmail: string;
  source: string;
  toolsUsed: string;
  skillsUsed: string;
  modelId: string;
  modelProviderId: string;
  modelResolutionMethod: string;
  credits: number;
}

export const MESSAGE_EXPORT_HEADERS: (keyof MessageExportRow)[] = [
  "messageId",
  "createdAt",
  "assistantId",
  "assistantName",
  "assistantSettings",
  "assistantTags",
  "conversationId",
  "parentMessageId",
  "userId",
  "userEmail",
  "source",
  "toolsUsed",
  "skillsUsed",
  "modelId",
  "modelProviderId",
  "modelResolutionMethod",
  "credits",
];

function joinDistinctSorted(values: (string | undefined | null)[]): string {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

interface MessageBaseRow {
  messageId: string;
  createdAt: Date;
  agentMessageModelId: ModelId;
  assistantId: string;
  conversationId: string;
  parentMessageId: string | null;
  userId: string | null;
  source: string | null;
  modelId: string | null;
  modelProviderId: string | null;
  modelResolutionMethod: string | null;
}

// Base row set: every agent message in the workspace/date range, joined down
// to the user message that triggered it to resolve the triggering user and,
// for run_agent sub-messages, the origin agent message id.
async function fetchBaseMessageRows(
  owner: WorkspaceType,
  startInstant: Date,
  exclusiveEndInstant: Date
): Promise<MessageBaseRow[]> {
  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
  return readReplica.query<MessageBaseRow>(
    `
    SELECT
      m."sId"                        AS "messageId",
      m."createdAt"                  AS "createdAt",
      am."id"                        AS "agentMessageModelId",
      am."agentConfigurationId"      AS "assistantId",
      am."resolvedModelId"           AS "modelId",
      am."resolvedProviderId"        AS "modelProviderId",
      am."modelResolutionMethod"     AS "modelResolutionMethod",
      c."sId"                        AS "conversationId",
      pum."agenticOriginMessageId"   AS "parentMessageId",
      pum."userContextOrigin"        AS "source",
      u."sId"                        AS "userId"
    FROM "messages" m
      JOIN "agent_messages" am ON am."id" = m."agentMessageId"
      JOIN "conversations" c ON c."id" = m."conversationId"
      LEFT JOIN "messages" pm ON pm."id" = m."parentId"
      LEFT JOIN "user_messages" pum ON pum."id" = pm."userMessageId"
      LEFT JOIN "users" u ON u."id" = pum."userId"
    WHERE m."workspaceId" = :wId
      AND m."agentMessageId" IS NOT NULL
      AND m."createdAt" >= :startInstant
      AND m."createdAt" < :exclusiveEndInstant
    ORDER BY m."createdAt" ASC
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        wId: owner.id,
        startInstant: startInstant.toISOString(),
        exclusiveEndInstant: exclusiveEndInstant.toISOString(),
      },
    }
  );
}

interface AssistantTagRow {
  sId: string;
  id: ModelId;
}

// Current tags for each agent, keyed by the agent's sId. Mirrors the same
// caveat as the analytics indexing job: this reflects the agent's tags today,
// not necessarily at message time, since tags can be edited without bumping
// the agent configuration version.
async function fetchAssistantTagsByAgentId(
  auth: Authenticator,
  owner: WorkspaceType,
  agentConfigurationIds: string[]
): Promise<Map<string, string[]>> {
  if (agentConfigurationIds.length === 0) {
    return new Map();
  }

  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
  const rows = await readReplica.query<AssistantTagRow>(
    `
    SELECT "sId", "id"
    FROM "agent_configurations"
    WHERE "workspaceId" = :wId
      AND "sId" IN (:agentIds)
      AND "status" = 'active'
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { wId: owner.id, agentIds: agentConfigurationIds },
    }
  );

  if (rows.length === 0) {
    return new Map();
  }

  const sIdByModelId = new Map(rows.map((r) => [r.id, r.sId]));
  const tagsByAgentModelId = await TagResource.listForAgents(
    auth,
    rows.map((r) => r.id)
  );

  const tagsByAgentSId = new Map<string, string[]>();
  for (const [modelId, tags] of Object.entries(tagsByAgentModelId)) {
    const sId = sIdByModelId.get(Number(modelId));
    if (sId) {
      tagsByAgentSId.set(
        sId,
        tags.map((tag) => tag.name)
      );
    }
  }
  return tagsByAgentSId;
}

interface ToolUsed {
  serverName: string;
  toolName: string;
}

async function fetchToolsUsedByMessage(
  auth: Authenticator,
  agentMessageModelIds: ModelId[]
): Promise<Map<ModelId, ToolUsed[]>> {
  if (agentMessageModelIds.length === 0) {
    return new Map();
  }

  const actions = await AgentMCPActionResource.listByAgentMessageIds(
    auth,
    agentMessageModelIds
  );

  const toolsByMessage = new Map<ModelId, ToolUsed[]>();
  for (const action of actions) {
    const { internalMCPServerName, mcpServerId } = action.metadata;
    const toolUsed: ToolUsed = {
      serverName: internalMCPServerName ?? mcpServerId ?? "unknown",
      toolName: getToolNameFromFunctionCallName(action.functionCallName),
    };
    const list = toolsByMessage.get(action.agentMessageId) ?? [];
    list.push(toolUsed);
    toolsByMessage.set(action.agentMessageId, list);
  }
  return toolsByMessage;
}

async function fetchSkillsUsedByMessage(
  auth: Authenticator,
  agentMessageModelIds: ModelId[]
): Promise<Map<ModelId, string[]>> {
  if (agentMessageModelIds.length === 0) {
    return new Map();
  }

  const workspaceId = auth.getNonNullableWorkspace().id;
  const where: WhereOptions<AgentMessageSkillModel> = {
    agentMessageId: { [Op.in]: agentMessageModelIds },
    workspaceId,
  };
  const skillRecords = await AgentMessageSkillModel.findAll({
    where,
    include: [
      {
        model: SkillConfigurationModel,
        as: "customSkill",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  });

  const globalSkillIds = [
    ...new Set(
      skillRecords.flatMap((r) => (r.globalSkillId ? [r.globalSkillId] : []))
    ),
  ];

  const globalSkillNameById = new Map<string, string>();
  if (globalSkillIds.length > 0) {
    const [globalSkills, systemSkills] = await Promise.all([
      GlobalSkillsRegistry.findAll(auth, { sId: globalSkillIds }),
      SystemSkillsRegistry.findAll(auth, { sId: globalSkillIds }),
    ]);
    for (const skill of [...globalSkills, ...systemSkills]) {
      globalSkillNameById.set(skill.sId, skill.name);
    }
  }

  const skillsByMessage = new Map<ModelId, string[]>();
  for (const record of skillRecords) {
    const name =
      record.customSkillId && record.customSkill
        ? record.customSkill.name
        : record.globalSkillId
          ? (globalSkillNameById.get(record.globalSkillId) ??
            record.globalSkillId)
          : null;
    if (!name) {
      continue;
    }
    const list = skillsByMessage.get(record.agentMessageId) ?? [];
    list.push(name);
    skillsByMessage.set(record.agentMessageId, list);
  }
  return skillsByMessage;
}

type MessageCreditsBucket = {
  key: { value: string };
  credit_micro?: estypes.AggregationsSumAggregate;
};

type MessageCreditsAggregations = {
  by_message?: estypes.AggregationsCompositeAggregate & {
    buckets: MessageCreditsBucket[];
    after_key?: { value: string };
  };
};

// Credits are not reliably available in Postgres: recent messages have not
// gone through the async attribution/reconciliation pass yet. The consumption
// analytics index reconciles credit_micro at write time, so it is the only
// source that is both accurate and available immediately. Documents are
// split per LLM step and per tool call, so bucket-and-sum by agent_message_id
// (paginated via composite aggregation, since a busy workspace can exceed a
// single page of distinct messages).
async function fetchCreditsByMessageId(
  auth: Authenticator,
  startInstant: string,
  exclusiveEndInstant: string
): Promise<Result<Map<string, number>, ElasticsearchError>> {
  const creditsByMessageId = new Map<string, number>();
  let afterKey: { value: string } | undefined;

  while (true) {
    const result = await searchConsumptionAnalytics<
      never,
      MessageCreditsAggregations
    >(
      buildConsumptionScopeQuery({
        auth,
        startDate: startInstant,
        endDate: exclusiveEndInstant,
      }),
      {
        aggregations: {
          by_message: {
            composite: {
              size: CREDITS_COMPOSITE_PAGE_SIZE,
              sources: [
                { value: { terms: { field: AGENT_MESSAGE_ID_FIELD } } },
              ],
              ...(afterKey ? { after: afterKey } : {}),
            },
            aggs: {
              credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
            },
          },
        },
        size: 0,
      }
    );

    if (result.isErr()) {
      return result;
    }

    const aggregation = result.value.aggregations?.by_message;
    const page = bucketsToArray<MessageCreditsBucket>(aggregation?.buckets);
    for (const bucket of page) {
      creditsByMessageId.set(
        String(bucket.key.value),
        Math.round(microCreditsToCredits(bucket.credit_micro?.value ?? 0))
      );
    }

    afterKey = aggregation?.after_key;
    if (!afterKey || page.length === 0) {
      break;
    }
  }

  return new Ok(creditsByMessageId);
}

export async function fetchMessageExportRows({
  auth,
  owner,
  startDate,
  endDate,
  timezone,
}: {
  auth: Authenticator;
  owner: WorkspaceType;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<MessageExportRow[], Error>> {
  const startInstant = moment.tz(startDate, timezone).startOf("day").toDate();
  const exclusiveEndInstant = moment
    .tz(endDate, timezone)
    .add(1, "day")
    .startOf("day")
    .toDate();

  const baseRows = await fetchBaseMessageRows(
    owner,
    startInstant,
    exclusiveEndInstant
  );

  if (baseRows.length === 0) {
    return new Ok([]);
  }

  const agentMessageModelIds = baseRows.map((row) => row.agentMessageModelId);
  const uniqueAgentIds = [...new Set(baseRows.map((row) => row.assistantId))];
  const uniqueUserIds = [
    ...new Set(
      baseRows
        .map((row) => row.userId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const [
    agentMeta,
    userEmails,
    assistantTagsByAgentId,
    toolsUsedByMessage,
    skillsUsedByMessage,
    creditsResult,
  ] = await Promise.all([
    fetchAgentMetadata(uniqueAgentIds, owner),
    fetchUserEmails(uniqueUserIds),
    fetchAssistantTagsByAgentId(auth, owner, uniqueAgentIds),
    fetchToolsUsedByMessage(auth, agentMessageModelIds),
    fetchSkillsUsedByMessage(auth, agentMessageModelIds),
    fetchCreditsByMessageId(
      auth,
      startInstant.toISOString(),
      exclusiveEndInstant.toISOString()
    ),
  ]);

  if (creditsResult.isErr()) {
    return new Err(new Error(creditsResult.error.message));
  }
  const creditsByMessageId = creditsResult.value;

  const uniqueServerNames = [
    ...new Set(
      [...toolsUsedByMessage.values()].flatMap((tools) =>
        tools.map((t) => t.serverName)
      )
    ),
  ];
  const serverDisplayNames = await resolveServerDisplayNames(
    auth,
    uniqueServerNames
  );

  const rows: MessageExportRow[] = baseRows.map((row) => {
    const agent = agentMeta.get(row.assistantId);
    const tools = toolsUsedByMessage.get(row.agentMessageModelId) ?? [];
    const skills = skillsUsedByMessage.get(row.agentMessageModelId) ?? [];

    return {
      messageId: row.messageId,
      createdAt: moment(row.createdAt)
        .tz(timezone)
        .format("YYYY-MM-DD HH:mm:ss"),
      assistantId: row.assistantId,
      assistantName: agent?.name ?? row.assistantId,
      assistantSettings: agent?.settings ?? "unknown",
      assistantTags: joinDistinctSorted(
        assistantTagsByAgentId.get(row.assistantId) ?? []
      ),
      conversationId: row.conversationId,
      parentMessageId: row.parentMessageId ?? "",
      userId: row.userId ?? "",
      userEmail: row.userId ? (userEmails.get(row.userId) ?? "") : "",
      source: row.source ?? "",
      toolsUsed: joinDistinctSorted(
        tools.map(
          (t) =>
            `${serverDisplayNames.get(t.serverName) ?? t.serverName}${TOOL_NAME_SEPARATOR}${t.toolName}`
        )
      ),
      skillsUsed: joinDistinctSorted(skills),
      modelId: row.modelId ?? "",
      modelProviderId: row.modelProviderId ?? "",
      modelResolutionMethod: row.modelResolutionMethod ?? "",
      credits: creditsByMessageId.get(row.messageId) ?? 0,
    };
  });

  return new Ok(rows);
}
