import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";
import { QueryTypes } from "sequelize";

const PAGE_SIZE = 10000;

interface AgentMessageDocument extends ElasticsearchBaseDocument {
  message_id: string;
  timestamp: string;
  agent_id: string;
  conversation_id: string;
  user_id: string;
  context_origin: string;
  status: string;
}

interface AgentMetaRow {
  sId: string;
  name: string;
  settings: string;
}

export interface MessageExportRow {
  messageId: string;
  createdAt: string;
  assistantId: string;
  assistantName: string;
  assistantSettings: string;
  conversationId: string;
  userId: string;
  userEmail: string;
  source: string;
}

export const MESSAGE_EXPORT_HEADERS: (keyof MessageExportRow)[] = [
  "messageId",
  "createdAt",
  "assistantId",
  "assistantName",
  "assistantSettings",
  "conversationId",
  "userId",
  "userEmail",
  "source",
];

async function fetchAllMessageDocuments(
  query: estypes.QueryDslQueryContainer
): Promise<Result<AgentMessageDocument[], Error>> {
  const allDocs: AgentMessageDocument[] = [];
  let searchAfter: estypes.SortResults | undefined;

  while (true) {
    const result = await searchAnalytics<AgentMessageDocument>(query, {
      size: PAGE_SIZE,
      sort: [{ timestamp: "asc" }, { message_id: "asc" }],
      search_after: searchAfter,
    });

    if (result.isErr()) {
      return new Err(new Error(result.error.message));
    }

    const { hits } = result.value.hits;
    for (const hit of hits) {
      if (hit._source) {
        allDocs.push(hit._source);
      }
    }

    if (hits.length < PAGE_SIZE) {
      break;
    }

    const lastHit = hits[hits.length - 1];
    searchAfter = lastHit.sort;
  }

  return new Ok(allDocs);
}

async function fetchAgentMetadata(
  agentIds: string[],
  workspaceModelId: ModelId
): Promise<Map<string, { name: string; settings: string }>> {
  if (agentIds.length === 0) {
    return new Map();
  }

  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
  const agents = await readReplica.query<AgentMetaRow>(
    `
    SELECT ac."sId",
           ac."name",
           CASE
             WHEN ac."status" = 'draft' THEN 'draft'
             WHEN ac."scope" = 'visible' THEN 'published'
             WHEN ac."scope" = 'hidden' THEN 'unpublished'
             ELSE 'unknown'
           END AS "settings"
    FROM "agent_configurations" ac
    WHERE ac."workspaceId" = :wId
      AND ac."sId" IN (:agentIds)
      AND ac."status" = 'active'
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { wId: workspaceModelId, agentIds },
    }
  );

  return new Map(
    agents.map((a) => [a.sId, { name: a.name, settings: a.settings }])
  );
}

async function fetchUserEmails(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const users = await UserResource.fetchByIds(userIds);
  return new Map(users.map((u) => [u.sId, u.email]));
}

export async function fetchMessageExportRows({
  workspaceId,
  workspaceModelId,
  startDate,
  endDate,
  timezone,
}: {
  workspaceId: string;
  workspaceModelId: ModelId;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<MessageExportRow[], Error>> {
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: workspaceId } },
        { term: { status: "succeeded" } },
        { range: { timestamp: { gte: startDate, lte: endDate } } },
      ],
    },
  };

  const docsResult = await fetchAllMessageDocuments(query);
  if (docsResult.isErr()) {
    return new Err(docsResult.error);
  }

  const docs = docsResult.value;

  const uniqueAgentIds = [
    ...new Set(docs.map((d) => d.agent_id).filter(Boolean)),
  ];
  const uniqueUserIds = [
    ...new Set(docs.map((d) => d.user_id).filter(Boolean)),
  ];

  const [agentMeta, userEmails] = await Promise.all([
    fetchAgentMetadata(uniqueAgentIds, workspaceModelId),
    fetchUserEmails(uniqueUserIds),
  ]);

  const rows: MessageExportRow[] = docs.map((doc) => {
    const agent = agentMeta.get(doc.agent_id);
    return {
      messageId: doc.message_id,
      createdAt: moment(doc.timestamp)
        .tz(timezone)
        .format("YYYY-MM-DD HH:mm:ss"),
      assistantId: doc.agent_id,
      assistantName: agent?.name ?? doc.agent_id,
      assistantSettings: agent?.settings ?? "unknown",
      conversationId: doc.conversation_id,
      userId: doc.user_id,
      userEmail: userEmails.get(doc.user_id) ?? "",
      source: doc.context_origin ?? "",
    };
  });

  return new Ok(rows);
}
