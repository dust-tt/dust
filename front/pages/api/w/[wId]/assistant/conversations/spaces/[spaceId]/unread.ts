import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type GetSpaceUnreadConversationsResponseBody = {
  unreadConversationIds: string[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpaceUnreadConversationsResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  switch (req.method) {
    case "GET": {
      const { spaceId } = req.query;

      if (!isString(spaceId)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "spaceId is required",
          },
        });
      }

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

      const unreadConversationIds =
        await ConversationResource.getSpaceUnreadConversationIds(
          auth,
          space.id
        );

      return res.status(200).json({
        unreadConversationIds,
      });
    }
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
