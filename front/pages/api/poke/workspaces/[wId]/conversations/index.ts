import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@app/types";

export type PokeListConversations = {
  conversations: ConversationWithoutContentType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListConversations>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Could not find conversations.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      // Get conversation IDs for this agent
      const conversationIds =
        await ConversationResource.listConversationWithAgentCreatedBeforeDate({
          auth,
          agentConfigurationId: req.query.agentId as string,
          cutoffDate: new Date(), // Current time to get all conversations
        });

      // Fetch full conversation objects
      const conversationResources = await ConversationResource.fetchByIds(
        auth,
        conversationIds
      );

      const conversations = conversationResources.map((c) => {
        return {
          id: c.id,
          created: c.createdAt.getTime(),
          sId: c.sId,
          owner: auth.getNonNullableWorkspace(),
          title: c.title,
          visibility: c.visibility,
          depth: c.depth,
          triggerId: c.triggerSId(),
          actionRequired: false, // We don't care about actionRequired/unread, so set to false
          unread: false,
          hasError: c.hasError,
          requestedGroupIds: c.getConversationRequestedGroupIdsFromModel(auth),
        };
      });

      // Sort by creation date (most recent first)
      conversations.sort((a, b) => b.created - a.created);

      return res.status(200).json({
        conversations,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
