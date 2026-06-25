import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import { QueryTypes } from "sequelize";

type TopAgentExportBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
  credits?: estypes.AggregationsFilterAggregate & {
    total?: estypes.AggregationsSumAggregate;
  };
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
  messages: number;
  distinctUsersReached: number;
  distinctConversations: number;
  lastEdit: string;
  credits: number;
}

export const AGENT_EXPORT_HEADERS: (keyof AgentExportRow)[] = [
  "agentId",
  "name",
  "description",
  "settings",
  "modelId",
  "providerId",
  "authorEmails",
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
  const esResult = await searchAnalytics<never, TopAgentsExportAggs>(
    {
      bool: {
        filter: [baseQuery],
      },
    },
    {
      aggregations: {
        by_agent: {
          terms: { field: "agent_id", size: 10000 },
          aggs: {
            unique_users: { cardinality: { field: "user_id" } },
            unique_conversations: {
              cardinality: { field: "conversation_id" },
            },
            // Credits mirror the billed scope (failed messages carry a cost in
            // the index but are never billed), while the count metrics above
            // stay inclusive of all activity.
            credits: {
              filter: { terms: { status: AGENT_MESSAGE_STATUSES_TO_TRACK } },
              aggs: { total: { sum: { field: "cost.full_awu" } } },
            },
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
        messages: b.doc_count,
        distinctUsersReached: Math.round(b.unique_users?.value ?? 0),
        distinctConversations: Math.round(b.unique_conversations?.value ?? 0),
        credits: Math.round(b.credits?.total?.value ?? 0),
      },
    ])
  );

  const scopeFilter = includeHiddenAgents ? "" : `AND ac."scope" != 'hidden'`;

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
           COALESCE(
             CAST(ac."updatedAt" AS DATE),
             CAST(ac."createdAt" AS DATE)
           ) AS "lastEdit"
    FROM "agent_configurations" ac
      LEFT JOIN "users" aut ON ac."authorId" = aut."id"
    WHERE ac."workspaceId" = :wId
      AND ac."status" = 'active'
      ${scopeFilter}
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
