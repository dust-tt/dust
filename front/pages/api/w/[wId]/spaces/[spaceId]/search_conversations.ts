import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchProjectConversations } from "@app/lib/api/projects";
import { withResourceFetchingFromRoute } from "@app/lib/api/resource_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type SearchConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};

const SearchConversationsQuerySchema = z.object({
  query: z.string().min(1, "Query parameter is required and cannot be empty"),
  limit: z.coerce
    .number()
    .int()
    .min(1, "Limit must be at least 1")
    .max(100, "Limit must be at most 100")
    .optional()
    .default(10),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SearchConversationsResponseBody>>,
  auth: Authenticator,
  { space }: { space: SpaceResource }
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

  // Validate query parameters using Zod
  const queryValidation = SearchConversationsQuerySchema.safeParse(req.query);
  if (!queryValidation.success) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid query parameters: ${fromError(queryValidation.error).toString()}`,
      },
    });
  }

  const { query, limit: topK } = queryValidation.data;

  const searchRes = await searchProjectConversations(auth, space, query, topK);

  if (searchRes.isErr()) {
    logger.error(
      {
        error: searchRes.error,
        workspaceId: auth.getNonNullableWorkspace().sId,
        spaceId: space.sId,
        query,
      },
      "Failed to search conversations in datasource"
    );

    switch (searchRes.error.code) {
      case "core_api_error":
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to search conversations.",
          },
        });
      case "data_source_view_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_view_not_found",
            message: "Project datasource view not found for this space.",
          },
        });
      case "data_source_not_found":
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "data_source_not_found",
            message: "Project datasource not found for this space.",
          },
        });
      default:
        assertNever(searchRes.error.code);
    }
  }

  return res.status(200).json({
    conversations: searchRes.value,
  });
}

export default withSessionAuthenticationForWorkspace(
  withResourceFetchingFromRoute(handler, {
    space: { requireCanReadOrAdministrate: true },
  })
);
