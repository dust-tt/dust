import type { GetSpaceConversationIdsResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 * Returns only the conversation IDs (sIds) for conversations in a space.
 * Used for garbage collection to identify conversations that no longer exist.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpaceConversationIdsResponseType>
  >,
  auth: Authenticator
): Promise<void> {
  const { wId, spaceId } = req.query;
  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid workspace id.",
      },
    });
  }
  if (!isString(spaceId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid space id.",
      },
    });
  }

  // Only allow system keys (connectors) to access this endpoint
  if (!auth.isSystemKey()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Fetch and verify space exists
      const space = await SpaceResource.fetchById(auth, spaceId);
      if (!space) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "space_not_found",
            message: "Space not found.",
          },
        });
      }

      // Get all conversation IDs for the space (only visible/non-deleted conversations)
      // This endpoint is used for garbage collection to identify conversations that
      // were hard-deleted and no longer exist in the database
      const spaceConversations =
        await ConversationResource.listConversationsInSpace(auth, {
          spaceId,
          options: {
            dangerouslySkipPermissionFiltering: true, // System key has access
            // Don't include deleted - we only want conversations that still exist
            includeDeleted: false,
          },
        });

      const conversationIds = spaceConversations.map((c) => c.sId);

      logger.info(
        {
          workspaceId: wId,
          spaceId,
          conversationCount: conversationIds.length,
        },
        "[GetSpaceConversationIds] Successfully fetched conversation IDs"
      );

      return res.status(200).json({
        conversationIds,
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

export default withPublicAPIAuthentication(handler);
