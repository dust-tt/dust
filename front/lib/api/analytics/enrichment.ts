import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { UserResource } from "@app/lib/resources/user_resource";
import type { ModelId } from "@app/types/shared/model_id";
import { QueryTypes } from "sequelize";

interface AgentMetaRow {
  sId: string;
  name: string;
  settings: string;
}

export async function fetchAgentMetadata(
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

export async function fetchUserEmails(
  userIds: string[]
): Promise<Map<string, string>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const users = await UserResource.fetchByIds(userIds);
  return new Map(users.map((u) => [u.sId, u.email]));
}

interface FeedbackContentRow {
  id: number;
  content: string | null;
}

// Feedback content is free text that we deliberately keep out of the analytics
// index; we read it from the DB at export time, keyed by the feedback ModelId.
export async function fetchFeedbackContents(
  feedbackModelIds: number[],
  workspaceModelId: ModelId
): Promise<Map<number, string>> {
  if (feedbackModelIds.length === 0) {
    return new Map();
  }

  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Matches existing Activity Report query pattern.
  const feedbacks = await readReplica.query<FeedbackContentRow>(
    `
    SELECT amf."id",
           amf."content"
    FROM "agent_message_feedbacks" amf
    WHERE amf."workspaceId" = :wId
      AND amf."id" IN (:feedbackIds)
    `,
    {
      type: QueryTypes.SELECT,
      replacements: { wId: workspaceModelId, feedbackIds: feedbackModelIds },
    }
  );

  const contentByFeedbackId = new Map<number, string>();
  for (const feedback of feedbacks) {
    if (feedback.content !== null) {
      contentByFeedbackId.set(feedback.id, feedback.content);
    }
  }

  return contentByFeedbackId;
}
