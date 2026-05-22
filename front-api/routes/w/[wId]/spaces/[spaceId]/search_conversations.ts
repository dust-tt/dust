import { searchProjectConversations } from "@app/lib/api/projects/search";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { z } from "zod";

export type SearchConversationsResponseBody = {
  conversations: ConversationWithoutContentType[];
};

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
const app = workspaceApp();

app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("query", SearchConversationsQuerySchema),
  async (ctx): HandlerResult<SearchConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { query, limit: topK } = ctx.req.valid("query");

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
      return apiError(ctx, {
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
    const conversationMap = new Map(conversations.map((ctx) => [ctx.sId, ctx]));

    const results = filteredResults
      .map((r) => conversationMap.get(r.conversationId)?.toJSON())
      .filter(
        (ctx): ctx is ConversationWithoutContentType => ctx !== undefined
      );

    return ctx.json({ conversations: results });
  }
);

export default app;
