import { SEMANTIC_SEARCH_SCORE_CUTOFF } from "@app/lib/api/assistant/conversation/semantic_search";
import { searchProjectConversations } from "@app/lib/api/projects/search";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  SearchQuerySchema,
  type SemanticSearchConversationsResponseBody,
} from "@app/types/api/assistant/conversation/semantic_search";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/assistant/conversations/semantic_search.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", SearchQuerySchema),
  async (ctx): HandlerResult<SemanticSearchConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const { query, limit } = ctx.req.valid("query");

    const projectSpaces = (await SpaceResource.listProjectSpaces(auth)).filter(
      (space) => space.isMember(auth)
    );

    if (projectSpaces.length === 0) {
      return ctx.json({ conversations: [] });
    }

    const searchRes = await searchProjectConversations(auth, {
      query,
      spaceIds: projectSpaces.map((s) => s.sId),
      topK: limit,
    });

    if (searchRes.isErr()) {
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

    const spaceIdToName = new Map(projectSpaces.map((s) => [s.sId, s.name]));

    const conversations = await ConversationResource.fetchByIdsWithReadState(
      auth,
      filteredResults.map((r) => r.conversationId)
    );
    const conversationMap = new Map(
      conversations.map((conv) => [conv.sId, conv])
    );

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
      .filter((conv) => conv !== null);

    return ctx.json({ conversations: results });
  }
);

export default app;
