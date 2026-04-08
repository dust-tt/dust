/** @ignoreswagger */
import type { AgentMessageFeedbackDirection } from "@app/lib/api/assistant/conversation/feedbacks";
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  AgentMessageFeedbackModel,
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { WorkspaceModel } from "@app/lib/resources/storage/models/workspace";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { UserResource } from "@app/lib/resources/user_resource";
import { apiError } from "@app/logger/withlogging";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

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
  conversationSId: string | null;
  messageSId: string | null;
}

export interface GetGlobalAgentFeedbacksResponseBody {
  feedbacks: GlobalAgentFeedbackItem[];
  hasMore: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetGlobalAgentFeedbacksResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(session, null);

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { includeEmpty, lastId } = req.query;

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
    return res.status(200).json({ feedbacks: [], hasMore: false });
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
  const conversationById = new Map(conversations.map((c) => [c.id, c.sId]));

  // Batch-fetch message sIds.
  const agentMessageIds = rows.map((r) => r.agentMessageId);
  const messages = await MessageModelWithBypass.findAll({
    // biome-ignore lint/plugin/noUnverifiedWorkspaceBypass: WORKSPACE_ISOLATION_BYPASS verified
    dangerouslyBypassWorkspaceIsolationSecurity: true,
    attributes: ["sId", "agentMessageId"],
    where: { agentMessageId: agentMessageIds },
  });
  const messageSIdByAgentMessageId = new Map(
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
      conversationSId: conversationById.get(row.conversationId) ?? null,
      messageSId: messageSIdByAgentMessageId.get(row.agentMessageId) ?? null,
    };
  });

  return res.status(200).json({ feedbacks, hasMore });
}

export default withSessionAuthenticationForPoke(handler);
