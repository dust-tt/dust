import {
  fetchAgentMetadata,
  fetchFeedbackContents,
  fetchUserEmails,
} from "@app/lib/api/analytics/enrichment";
import config from "@app/lib/api/config";
import type { ElasticsearchBaseDocument } from "@app/lib/api/elasticsearch";
import { searchAnalytics } from "@app/lib/api/elasticsearch";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { AgentMessageAnalyticsFeedback } from "@app/types/assistant/analytics";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import type { estypes } from "@elastic/elasticsearch";
import moment from "moment-timezone";

const PAGE_SIZE = 10000;

interface FeedbackAgentMessageDocument extends ElasticsearchBaseDocument {
  message_id: string;
  conversation_id: string;
  agent_id: string;
  timestamp: string;
  feedbacks: AgentMessageAnalyticsFeedback[];
}

export interface FeedbackExportRow {
  feedbackId: string;
  createdAt: string;
  assistantId: string;
  assistantName: string;
  conversationId: string;
  conversationUrl: string;
  userId: string;
  userEmail: string;
  thumb: string;
  content: string;
  dismissed: string;
}

export const FEEDBACK_EXPORT_HEADERS: (keyof FeedbackExportRow)[] = [
  "feedbackId",
  "createdAt",
  "assistantId",
  "assistantName",
  "conversationId",
  "conversationUrl",
  "userId",
  "userEmail",
  "thumb",
  "content",
  "dismissed",
];

async function fetchAllFeedbackDocuments(
  query: estypes.QueryDslQueryContainer
): Promise<Result<FeedbackAgentMessageDocument[], Error>> {
  const allDocs: FeedbackAgentMessageDocument[] = [];
  let searchAfter: estypes.SortResults | undefined;

  while (true) {
    const result = await searchAnalytics<FeedbackAgentMessageDocument>(query, {
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

export async function fetchFeedbackExportRows({
  owner,
  startDate,
  endDate,
  timezone,
}: {
  owner: WorkspaceType;
  startDate: string;
  endDate: string;
  timezone: string;
}): Promise<Result<FeedbackExportRow[], Error>> {
  // Feedback is filtered by the date the feedback was given (which can differ
  // from the message timestamp), so we range on the nested feedbacks.created_at
  // and post-filter each document's feedbacks to the requested window.
  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;

  const query: estypes.QueryDslQueryContainer = {
    bool: {
      filter: [
        { term: { workspace_id: owner.sId } },
        {
          nested: {
            path: "feedbacks",
            query: {
              range: {
                "feedbacks.created_at": { gte: startIso, lte: endIso },
              },
            },
          },
        },
      ],
    },
  };

  const docsResult = await fetchAllFeedbackDocuments(query);
  if (docsResult.isErr()) {
    return new Err(docsResult.error);
  }

  const docs = docsResult.value;

  const uniqueAgentIds = [
    ...new Set(docs.map((d) => d.agent_id).filter(Boolean)),
  ];
  const allFeedbacks = docs.flatMap((d) => d.feedbacks ?? []);
  const uniqueUserIds = [
    ...new Set(allFeedbacks.map((f) => f.user_id).filter(Boolean)),
  ];
  const uniqueFeedbackIds = [
    ...new Set(allFeedbacks.map((f) => f.feedback_id).filter(Boolean)),
  ];

  const [agentMeta, userEmails, feedbackContents] = await Promise.all([
    fetchAgentMetadata(uniqueAgentIds, owner.id),
    fetchUserEmails(uniqueUserIds),
    fetchFeedbackContents(uniqueFeedbackIds, owner.id),
  ]);

  const rows: FeedbackExportRow[] = [];
  for (const doc of docs) {
    const agent = agentMeta.get(doc.agent_id);
    for (const feedback of doc.feedbacks ?? []) {
      // A matched document can carry feedbacks outside the requested window;
      // keep only the ones created within it.
      if (feedback.created_at < startIso || feedback.created_at > endIso) {
        continue;
      }
      rows.push({
        // feedback_id is stored as the internal ModelId; expose the opaque sId.
        feedbackId: AgentMessageFeedbackResource.modelIdToSId({
          id: feedback.feedback_id,
          workspaceId: owner.id,
        }),
        createdAt: moment(feedback.created_at)
          .tz(timezone)
          .format("YYYY-MM-DD HH:mm:ss"),
        assistantId: doc.agent_id,
        assistantName: agent?.name ?? doc.agent_id,
        conversationId: doc.conversation_id,
        conversationUrl: feedback.is_conversation_shared
          ? getConversationRoute(
              owner.sId,
              doc.conversation_id,
              undefined,
              config.getAppUrl()
            )
          : "",
        userId: feedback.user_id,
        userEmail: userEmails.get(feedback.user_id) ?? "",
        thumb: feedback.thumb_direction,
        content: feedbackContents.get(feedback.feedback_id) ?? "",
        dismissed: feedback.dismissed ? "true" : "false",
      });
    }
  }

  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return new Ok(rows);
}
