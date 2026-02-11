import type { NextApiRequest, NextApiResponse } from "next";

import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@app/logger/withlogging";
import type { LightConversationType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString, removeNulls } from "@app/types/shared/utils/general";

export type GetSpaceConversationsResponseBody = {
  conversations: LightConversationType[];
  hasMore: boolean;
  lastValue: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSpaceConversationsResponseBody>>,
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

      const paginationRes = getPaginationParams(req, {
        defaultLimit: 20,
        defaultOrderColumn: "updatedAt",
        defaultOrderDirection: "desc",
        supportedOrderColumn: ["updatedAt"],
      });

      if (paginationRes.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: paginationRes.error.reason,
          },
        });
      }

      const pagination = paginationRes.value;

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

      // Get paginated conversations for the space
      const {
        conversations: spaceConversations,
        hasMore,
        lastValue,
      } = await ConversationResource.listConversationsInSpacePaginated(auth, {
        spaceId,
        pagination: {
          limit: pagination.limit,
          lastValue: pagination.lastValue,
          orderDirection: pagination.orderDirection,
        },
      });

      // Fetch full conversation details for the paginated results
      // We're doing N+1 queries here, very bad for scaling
      // TODO(@jd) - Find a better way
      const spaceConversationsFull = await concurrentExecutor(
        spaceConversations,
        async (c) => getLightConversation(auth, c.sId),
        { concurrency: 10 }
      );

      return res.status(200).json({
        conversations: removeNulls(
          spaceConversationsFull.map((c) => (c.isOk() ? c.value : null))
        ),
        hasMore,
        lastValue,
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
