import { Hono } from "hono";
import { Op } from "sequelize";

import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import {
  AgentMessageFeedbackModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { UserResource } from "@app/lib/resources/user_resource";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { isString } from "@app/types/shared/utils/general";

const PAGE_SIZE = 500;

const GLOBAL_AGENT_IDS = Object.values(GLOBAL_AGENTS_SID);

// Type casts to enable cross-workspace queries for poke super-admin.
const AgentMessageFeedbackModelWithBypass: ModelStaticWorkspaceAware<AgentMessageFeedbackModel> =
  AgentMessageFeedbackModel;
const ConversationModelWithBypass: ModelStaticWorkspaceAware<ConversationModel> =
  ConversationModel;
const MessageModelWithBypass: ModelStaticWorkspaceAware<MessageModel> =
  MessageModel;

export interface GlobalAgentFeedbackItem {
  id: number;
  createdAt: string;
  agentConfigurationId: string;
  thumbDirection: AgentMessageFeedbackDirection;
  content: string | null;
  userName: string | null;
  userEmail: string | null;
  isConversationShared: boolean;
  workspaceId: string;
  workspaceName: string;
  conversationId: string | null;
  messageId: string | null;
}

// Mounted at /api/poke/global-agent-feedbacks. pokeAuth is applied by the
// parent poke sub-app.
const app = new Hono();

app.get("/", async (c) => {
  const includeEmpty = c.req.query("includeEmpty");
  const lastId = c.req.query("lastId");

  const where: Record<string, unknown> = {
    agentConfigurationId: { [Op.in]: GLOBAL_AGENT_IDS },
  };

  if (includeEmpty !== "true") {
    where.content = { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] };
  }

  if (isString(lastId)) {
    const parsed = parseInt(lastId, 10);
    if (!isNaN(parsed)) {
      where.id = { [Op.lt]: parsed };
    }
  }

  // WORKSPACE_ISOLATION_BYPASS: Poke super-admin query across all workspaces
  // to aggregate global agent feedback for internal review.
  const feedbackRows = await AgentMessageFeedbackModelWithBypass.findAll({
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
    where,
    include: [
      {
        model: UserResource.model,
        as: "user",
        attributes: ["name", "email"],
      },
    ],
    order: [["id", "DESC"]],
    limit: PAGE_SIZE + 1,
  });

  const hasMore = feedbackRows.length > PAGE_SIZE;
  const rows = feedbackRows.slice(0, PAGE_SIZE);

  if (rows.length === 0) {
    return c.json({ feedbacks: [], hasMore: false });
  }

  // Batch-fetch workspace info.
  const workspaceIds = [...new Set(rows.map((r) => r.workspaceId))];
  const workspaces = await WorkspaceModel.findAll({
    attributes: ["id", "sId", "name"],
    where: { id: workspaceIds },
  });
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  // Batch-fetch conversation sIds.
  const conversationIds = [...new Set(rows.map((r) => r.conversationId))];
  const conversations = await ConversationModelWithBypass.findAll({
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
    attributes: ["id", "sId"],
    where: { id: conversationIds },
  });
  const conversationById = new Map(conversations.map((cv) => [cv.id, cv.sId]));

  // Batch-fetch message sIds.
  const agentMessageIds = rows.map((r) => r.agentMessageId);
  const messages = await MessageModelWithBypass.findAll({
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
    attributes: ["sId", "agentMessageId"],
    where: { agentMessageId: agentMessageIds },
  });
  const messageIdByAgentMessageId = new Map(
    messages.map((m) => [m.agentMessageId, m.sId])
  );

  const feedbacks: GlobalAgentFeedbackItem[] = rows.map((row) => {
    const workspace = workspaceById.get(row.workspaceId);
    return {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      agentConfigurationId: row.agentConfigurationId,
      thumbDirection: row.thumbDirection,
      content: row.content,
      userName: row.user?.name ?? null,
      userEmail: row.user?.email ?? null,
      isConversationShared: row.isConversationShared,
      workspaceId: workspace?.sId ?? "unknown",
      workspaceName: workspace?.name ?? "Unknown",
      conversationId: conversationById.get(row.conversationId) ?? null,
      messageId: messageIdByAgentMessageId.get(row.agentMessageId) ?? null,
    };
  });

  return c.json({ feedbacks, hasMore });
});

export default app;
