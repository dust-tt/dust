import { fetchAgentMetadata } from "@app/lib/api/analytics/enrichment";
import config from "@app/lib/api/config";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { WorkspaceType } from "@app/types/user";
import moment from "moment-timezone";

export interface FeedbackExportRow {
  feedbackId: string;
  createdAt: string;
  assistantId: string;
  assistantName: string;
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
  "conversationUrl",
  "userId",
  "userEmail",
  "thumb",
  "content",
  "dismissed",
];

/**
 * Feedback (thumb, content, dismissed) lives entirely in Postgres — it was
 * never in the consumption index, so this reads straight from
 * AgentMessageFeedbackResource instead of Elasticsearch.
 */
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
  const startInstant = moment.tz(startDate, timezone).startOf("day").toDate();
  const exclusiveEndInstant = moment
    .tz(endDate, timezone)
    .add(1, "day")
    .startOf("day")
    .toDate();

  // Note: getFeedbackUsageDataForWorkspace filters out feedback whose author
  // user record can no longer be resolved (e.g. deleted user), so those rows
  // are silently excluded from the export.
  const feedbacks =
    await AgentMessageFeedbackResource.getFeedbackUsageDataForWorkspace({
      startDate: startInstant,
      endDate: exclusiveEndInstant,
      workspace: owner,
    });

  if (feedbacks.length === 0) {
    return new Ok([]);
  }

  const uniqueAgentIds = [
    ...new Set(feedbacks.map((f) => f.agentConfigurationId)),
  ];

  const agentMeta = await fetchAgentMetadata(uniqueAgentIds, owner);

  const rows: FeedbackExportRow[] = feedbacks.map((feedback) => {
    const conversationId = feedback.toJSON().conversationId;
    const agent = agentMeta.get(feedback.agentConfigurationId);

    return {
      feedbackId: feedback.sId,
      createdAt: moment(feedback.createdAt)
        .tz(timezone)
        .format("YYYY-MM-DD HH:mm:ss"),
      assistantId: feedback.agentConfigurationId,
      assistantName: agent?.name ?? feedback.agentConfigurationId,
      conversationUrl:
        feedback.isConversationShared && conversationId
          ? getConversationRoute(
              owner.sId,
              conversationId,
              undefined,
              config.getAppUrl()
            )
          : "",
      userId: feedback.user?.sId ?? "",
      userEmail: feedback.user?.email ?? "",
      thumb: feedback.thumbDirection,
      content: feedback.content ?? "",
      dismissed: feedback.dismissed ? "true" : "false",
    };
  });

  rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return new Ok(rows);
}
