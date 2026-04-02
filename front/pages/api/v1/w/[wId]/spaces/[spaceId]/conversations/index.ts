import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import { addBackwardCompatibleConversationFields } from "@app/lib/api/v1/backward_compatibility";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { getConversationRoute } from "@app/lib/utils/router";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { GetSpaceConversationsForDataSourceResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetSpaceConversationsForDataSourceResponseType>
  >,
  auth: Authenticator,
  { space }: { space: SpaceResource }
): Promise<void> {
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
      const { updatedSince } = req.query;
      const updatedSinceMs = isString(updatedSince)
        ? parseInt(updatedSince, 10)
        : null;

      // Get all conversations for the space (including deleted ones)
      // Filter by updatedSince at the database level if provided
      const spaceConversations =
        await ConversationResource.listConversationsInSpace(auth, {
          spaceId: space.sId,
          options: {
            dangerouslySkipPermissionFiltering: true, // System key has access
            includeDeleted: true, // Include deleted conversations so sync can detect and remove them
            updatedSince: updatedSinceMs ?? undefined,
          },
        });

      // Fetch full conversations (returns raw ConversationType)
      // Include deleted conversations so sync can detect and remove them
      const conversationsFull = await concurrentExecutor(
        spaceConversations,
        async (c) => getConversation(auth, c.sId, true), // includeDeleted = true
        { concurrency: 10 }
      );

      const conversations = removeNulls(
        conversationsFull.map((c) => (c.isOk() ? c.value : null))
      );

      const wId = auth.getNonNullableWorkspace().sId;

      // Return raw conversations directly (ConversationSchema) - formatting happens in sync_conversation.ts
      const responseConversations = conversations.map((c: ConversationType) => {
        // Return the full conversation object as-is (matches ConversationSchema)
        return {
          ...c,
          url: getConversationRoute(wId, c.sId, undefined, config.getAppUrl()),
        };
      });

      logger.info(
        {
          wId,
          spaceId: space.sId,
          conversationCount: responseConversations.length,
          updatedSince,
        },
        "[GetSpaceConversationsForDataSource] Successfully fetched conversations"
      );

      return res.status(200).json({
        conversations: responseConversations.map(
          addBackwardCompatibleConversationFields
        ),
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

export default withPublicAPIAuthentication(
  withResourceFetchingFromRoute(handler, { space: {} })
);
