import { bucketsToArray, searchAnalytics } from "@app/lib/api/elasticsearch";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import { QueryTypes } from "sequelize";

type TopAgentExportBucket = {
  key: string;
  doc_count: number;
  unique_users?: estypes.AggregationsCardinalityAggregate;
  unique_conversations?: estypes.AggregationsCardinalityAggregate;
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
}

export const AGENT_EXPORT_HEADERS: (keyof AgentExportRow)[] = [
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
];

export async function fetchAgentExportRows(
  baseQuery: estypes.QueryDslQueryContainer,
  owner: WorkspaceType
): Promise<Result<AgentExportRow[], Error>> {
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
      },
    ])
  );

  const scopeFilter =
    owner.role === "admin" ? "" : `AND ac."scope" != 'hidden'`;

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
    };
  });

  rows.sort((a, b) => b.messages - a.messages);

  return new Ok(rows);
}
