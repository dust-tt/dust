import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { searchProjectConversations } from "@app/lib/api/projects/search";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const SEMANTIC_SEARCH_SCORE_CUTOFF = 0.1;

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

// Mounted under /api/w/:wId/spaces/:spaceId/search_conversations.
const app = new Hono();

app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("query", SearchConversationsQuerySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const { query, limit: topK } = c.req.valid("query");

    const searchRes = await searchProjectConversations(auth, {
      query,
      spaceIds: [space.sId],
      topK,
    });

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
      return apiError(c, {
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

    const conversations = await ConversationResource.fetchByIds(
      auth,
      filteredResults.map((r) => r.conversationId)
    );
    const conversationMap = new Map(conversations.map((c) => [c.sId, c]));

    const results = filteredResults
      .map((r) => conversationMap.get(r.conversationId)?.toJSON())
      .filter((c): c is ConversationWithoutContentType => c !== undefined);

    return c.json({ conversations: results });
  }
);

export default app;
