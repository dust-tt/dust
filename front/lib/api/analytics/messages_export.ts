import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import {
  fetchAgentMetadata,
  fetchUserEmails,
} from "@app/lib/api/analytics/enrichment";
import { resolveServerDisplayNames } from "@app/lib/api/assistant/observability/tool_usage";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

const PAGE_SIZE = 10000;

interface AgentMessageDocument extends ElasticsearchBaseDocument {
  message_id: string;
  timestamp: string;
  agent_id: string;
  conversation_id: string;
  user_id: string;
  context_origin: string;
  status: string;
  tools_used?: { server_name: string; tool_name: string }[];
  skills_used?: { skill_name: string }[];
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
  toolsUsed: string;
  skillsUsed: string;
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
  "toolsUsed",
  "skillsUsed",
];

function joinDistinctSorted(values: (string | undefined | null)[]): string {
  return [...new Set(values.filter((v): v is string => Boolean(v)))]
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

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
  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: owner.sId } },
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
  const uniqueServerNames = [
    ...new Set(
      docs.flatMap((d) => (d.tools_used ?? []).map((t) => t.server_name))
    ),
  ];

  const [agentMeta, userEmails, serverDisplayNames] = await Promise.all([
    fetchAgentMetadata(uniqueAgentIds, owner),
    fetchUserEmails(uniqueUserIds),
    resolveServerDisplayNames(auth, uniqueServerNames),
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
      toolsUsed: joinDistinctSorted(
        (doc.tools_used ?? []).map(
          (t) =>
            `${serverDisplayNames.get(t.server_name) ?? t.server_name}${TOOL_NAME_SEPARATOR}${t.tool_name}`
        )
      ),
      skillsUsed: joinDistinctSorted(
        (doc.skills_used ?? []).map((s) => s.skill_name)
      ),
    };
  });

  return new Ok(rows);
}
