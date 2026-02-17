import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { getPaginationParams } from "@app/lib/api/pagination";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export type SearchConversationsResponseBody = {
  conversations: Array<
    ConversationWithoutContentType & { spaceName: string | null }
  >;
  hasMore: boolean;
  lastValue: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchConversationsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const paginationRes = getPaginationParams(req, {
    defaultLimit: 20,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
    maxLimit: 100,
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

  const { query } = req.query;
  if (!isString(query) || query.length === 0) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Query parameter is required",
      },
    });
  }

  const pagination = paginationRes.value;

  const result = await ConversationResource.searchByTitlePaginated(auth, {
    query,
    pagination: {
      limit: pagination.limit,
      lastValue: pagination.lastValue,
      orderDirection: pagination.orderDirection,
    },
  });

  const conversations = result.conversations.map((c) => ({
    ...c.toJSON(),
    spaceName: null,
  }));

  return res.status(200).json({
    conversations,
    hasMore: result.hasMore,
    lastValue: result.lastValue,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
