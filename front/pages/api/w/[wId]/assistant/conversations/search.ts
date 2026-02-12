import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import { searchProjectConversations } from "@app/lib/api/projects";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";

const SEMANTIC_SEARCH_SCORE_CUTOFF = 0.25;

export type SearchConversationsResponseBody = {
  conversations: Array<ConversationWithoutContentType & { spaceName: string }>;
};

const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
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

  const { query, limit } = queryValidation.data;

  const projectSpaces = await SpaceResource.listProjectSpaces(auth);

  if (projectSpaces.length === 0) {
    return res.status(200).json({ conversations: [] });
  }

  const searchRes = await searchProjectConversations(auth, {
    query,
    spaceIds: projectSpaces.map((s) => s.sId),
    topK: limit,
  });

  if (searchRes.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to search conversations.",
      },
    });
  }

  const filteredResults = searchRes.value.filter(
    (r) => r.score >= SEMANTIC_SEARCH_SCORE_CUTOFF
  );

  const spaceIdToName = new Map(projectSpaces.map((s) => [s.sId, s.name]));

  const conversations = await ConversationResource.fetchByIds(
    auth,
    filteredResults.map((r) => r.conversationId)
  );
  const conversationMap = new Map(conversations.map((c) => [c.sId, c]));

  const results = filteredResults
    .map((r) => {
      const conv = conversationMap.get(r.conversationId);
      if (!conv) {
        return null;
      }
      return {
        ...conv.toJSON(),
        spaceName: spaceIdToName.get(r.spaceId) ?? "Unknown",
      };
    })
    .filter((c) => c !== null);

  return res.status(200).json({ conversations: results });
}

export default withSessionAuthenticationForWorkspace(handler);
