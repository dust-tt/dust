import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@app/types";

export type GetSpaceConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSpaceConversationsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET":
      const { spaceId } = req.query;

      if (typeof spaceId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "spaceId is required",
          },
        });
      }

      // Fetch and verify space access
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space || !space.canReadOrAdministrate(auth)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found or access denied",
          },
        });
      }

      // Get all conversations for the user
      const allConversations =
        await ConversationResource.listConversationsForUser(auth);

      // Filter conversations by spaceId
      const spaceConversations = allConversations.filter(
        (c) => c.space?.sId === spaceId
      );

      // Sort by updated time descending (most recent first)
      const sortedConversations = spaceConversations
        .map((c) => c.toJSON())
        .sort((a, b) => b.updated - a.updated);

      return res.status(200).json({
        conversations: sortedConversations,
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
