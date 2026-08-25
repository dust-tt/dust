import {
  AGENT_MESSAGE_ID_FIELD,
  CARDINALITY_PRECISION_THRESHOLD,
  CONSUMPTION_DIMENSION_FIELDS,
  CONVERSATION_ID_FIELD,
  CREDIT_MICRO_FIELD,
} from "@app/lib/api/analytics/consumption/scope";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import {
  bucketsToArray,
  searchConsumptionAnalytics,
} from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { microCreditsToCredits } from "@app/lib/credits/units";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { QueryTypes } from "sequelize";

type TopAgentExportBucket = {
  key: string;
  doc_count: number;
  unique_messages?: estypes.AggregationsCardinalityAggregate;
  unique_users?: estypes.AggregationsCardinalityAggregate;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  credit_micro?: estypes.AggregationsSumAggregate;
};

type TopAgentsExportAggs = {
  by_agent?: estypes.AggregationsMultiBucketAggregateBase<TopAgentExportBucket>;
};

interface AgentMetadataRow {
  sId: string;
  name: string;
  description: string;
  settings: string;
  modelId: string;
  providerId: string;
  authorEmail: string | null;
  editorEmails: string[] | null;
  lastEdit: string;
}

export interface AgentExportRow {
  agentId: string;
  name: string;
  description: string;
  settings: string;
  modelId: string;
  providerId: string;
  authorEmails: string;
  // Emails of every user who edited any version of the agent
  // Returned as an array in JSON; CSV renders it joined with "; "
  editorEmails: string[];
  messages: number;
  distinctUsersReached: number;
  distinctConversations: number;
  lastEdit: string;
  credits: number;
}

// CSV projection of AgentExportRow: the CSV serializer only handles scalar
// cells, so the array-valued editorEmails is joined into a single
// comma-separated string. The serializer then wraps it in double quotes
// automatically since the cell contains commas.
type AgentExportCsvRow = Omit<AgentExportRow, "editorEmails"> & {
  editorEmails: string;
};

export function toAgentExportCsvRow(row: AgentExportRow): AgentExportCsvRow {
  return { ...row, editorEmails: row.editorEmails.join(",") };
}

export const AGENT_EXPORT_HEADERS: (keyof AgentExportRow)[] = [
  "agentId",
  "name",
  "description",
  "settings",
  "modelId",
  "providerId",
  "authorEmails",
  "editorEmails",
  "messages",
  "distinctUsersReached",
  "distinctConversations",
  "lastEdit",
  "credits",
];

export async function fetchAgentExportRows(
  baseQuery: estypes.QueryDslQueryContainer,
  auth: Authenticator,
  includeHiddenAgents: boolean
): Promise<Result<AgentExportRow[], Error>> {
  const owner = auth.getNonNullableWorkspace();
  const esResult = await searchConsumptionAnalytics<never, TopAgentsExportAggs>(
    {
      bool: {
        filter: [baseQuery],
      },
    },
    {
      aggregations: {
        by_agent: {
          terms: { field: CONSUMPTION_DIMENSION_FIELDS.agent, size: 10000 },
          aggs: {
            // Consumption documents are split per LLM step and per tool call,
            // so a message contributes several documents to the same agent
            // bucket: dedupe by agent_message_id to count distinct messages.
            unique_messages: {
              cardinality: {
                field: AGENT_MESSAGE_ID_FIELD,
                precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
              },
            },
            unique_users: {
              cardinality: {
                field: CONSUMPTION_DIMENSION_FIELDS.user,
                precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
              },
            },
            unique_conversations: {
              cardinality: {
                field: CONVERSATION_ID_FIELD,
                precision_threshold: CARDINALITY_PRECISION_THRESHOLD,
              },
            },
            credit_micro: { sum: { field: CREDIT_MICRO_FIELD } },
          },
        },
      },
      size: 0,
    }
  );

  if (esResult.isErr()) {
    return new Err(new Error(esResult.error.message));
  }

  const buckets = bucketsToArray<TopAgentExportBucket>(
    esResult.value.aggregations?.by_agent?.buckets
  );

  const esMetrics = new Map(
    buckets.map((b) => [
      String(b.key),
      {
        messages: Math.round(b.unique_messages?.value ?? 0),
        distinctUsersReached: Math.round(b.unique_users?.value ?? 0),
        distinctConversations: Math.round(b.unique_conversations?.value ?? 0),
        credits: Math.round(microCreditsToCredits(b.credit_micro?.value ?? 0)),
      },
    ])
  );

  const scopeFilter = (alias: string) =>
    includeHiddenAgents ? "" : `AND ${alias}."scope" != 'hidden'`;

  // TODO(BACK5): Migrate to AgentConfigurationResource when a suitable method exists.
  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
  const agents = await readReplica.query<AgentMetadataRow>(
    `
    SELECT ac."sId",
           ac."name",
           ac."description",
           CASE
             WHEN ac."scope" = 'visible' THEN 'published'
             WHEN ac."scope" = 'hidden' THEN 'unpublished'
             ELSE 'unknown'
           END AS "settings",
           ac."modelId",
           ac."providerId",
           aut."email" AS "authorEmail",
           editors."editorEmails",
           COALESCE(
             CAST(ac."updatedAt" AS DATE),
             CAST(ac."createdAt" AS DATE)
           ) AS "lastEdit"
    FROM "agent_configurations" ac
      LEFT JOIN "users" aut ON ac."authorId" = aut."id"
      -- Aggregate the emails of every user who authored any version of the
      -- agent (matching how "lastAuthors" is sourced in recent_authors.ts:
      -- distinct authorIds across all versions, not just the active one).
      LEFT JOIN (
        SELECT av."sId",
               ARRAY_AGG(DISTINCT edt."email") AS "editorEmails"
        FROM "agent_configurations" av
          JOIN "users" edt ON av."authorId" = edt."id"
        WHERE av."workspaceId" = :wId
          -- Only aggregate versions of the agents the outer query exports;
          -- computing editors for archived/draft agents is wasted work.
          AND av."sId" IN (
            SELECT act."sId"
            FROM "agent_configurations" act
            WHERE act."workspaceId" = :wId
              AND act."status" = 'active'
              ${scopeFilter("act")}
          )
        GROUP BY av."sId"
      ) editors ON editors."sId" = ac."sId"
    WHERE ac."workspaceId" = :wId
      AND ac."status" = 'active'
      ${scopeFilter("ac")}
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { wId: owner.id },
    }
  );

  const rows: AgentExportRow[] = agents.map((agent) => {
    const metrics = esMetrics.get(agent.sId);
    return {
      agentId: agent.sId,
      name: agent.name,
      description: agent.description,
      settings: agent.settings,
      modelId: agent.modelId,
      providerId: agent.providerId,
      authorEmails: agent.authorEmail ?? "",
      editorEmails: agent.editorEmails ?? [],
      messages: metrics?.messages ?? 0,
      distinctUsersReached: metrics?.distinctUsersReached ?? 0,
      distinctConversations: metrics?.distinctConversations ?? 0,
      lastEdit: agent.lastEdit,
      credits: metrics?.credits ?? 0,
    };
  });

  const globalAgentIds = buckets
    .map((b) => String(b.key))
    .filter(isGlobalAgentId);
  if (globalAgentIds.length > 0) {
    const globalAgents = await getAgentConfigurations(auth, {
      agentIds: globalAgentIds,
      variant: "extra_light",
    });
    for (const agent of globalAgents) {
      const metrics = esMetrics.get(agent.sId);
      rows.push({
        agentId: agent.sId,
        name: agent.name,
        description: agent.description,
        settings: "global",
        modelId: agent.model.modelId,
        providerId: agent.model.providerId,
        authorEmails: "",
        editorEmails: [],
        messages: metrics?.messages ?? 0,
        distinctUsersReached: metrics?.distinctUsersReached ?? 0,
        distinctConversations: metrics?.distinctConversations ?? 0,
        lastEdit: "",
        credits: metrics?.credits ?? 0,
      });
    }
  }

  rows.sort((a, b) => b.messages - a.messages);

  return new Ok(rows);
}
