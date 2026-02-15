import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export type SearchConversationsResponseBody = {
  conversations: Array<
    ConversationWithoutContentType & { spaceName: string | null }
  >;
  hasMore: boolean;
  lastValue: string | null;
};

const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  lastValue: z.string().optional(),
  orderDirection: z.enum(["asc", "desc"]).optional().default("desc"),
});

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

  const queryValidation = SearchQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { query, limit, lastValue, orderDirection } = queryValidation.data;

  const result = await ConversationResource.searchByTitlePaginated(auth, {
    query,
    pagination: {
      limit,
      lastValue,
      orderDirection,
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
