import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { ConversationType, WithAPIErrorResponse } from "@app/types";
import { removeNulls } from "@app/types";

export type GetSpaceConversationsResponseBody = {
  conversations: ConversationType[];
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

      // Get all conversations for the space
      const spaceConversations =
        await ConversationResource.listConversationsInSpace(auth, {
          spaceId,
        });

      // This is not going to scale AT ALL but it's a quick and dirty way to get the full conversations for the space as we display more informations than usual.
      // TODO(conversations-groups) Implement pagination.
      const spaceConversationsFull = await concurrentExecutor(
        spaceConversations,
        async (c) => getConversation(auth, c.sId),
        { concurrency: 10 }
      );

      return res.status(200).json({
        conversations: removeNulls(
          spaceConversationsFull.map((c) => (c.isOk() ? c.value : null))
        ),
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
