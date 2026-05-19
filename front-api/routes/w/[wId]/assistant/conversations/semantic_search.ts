import { Hono } from "hono";
import { z } from "zod";

import { searchProjectConversations } from "@app/lib/api/projects/search";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const SEMANTIC_SEARCH_SCORE_CUTOFF = 0.25;

const SearchQuerySchema = z.object({
  query: z.string().min(1, "Query is required"),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
});

// Mounted at /api/w/:wId/assistant/conversations/semantic_search.
const app = new Hono();

app.get("/", validate("query", SearchQuerySchema), async (c) => {
  const auth = c.get("auth");
  const { query, limit } = c.req.valid("query");

  const projectSpaces = (await SpaceResource.listProjectSpaces(auth)).filter(
    (space) => space.isMember(auth)
  );

  if (projectSpaces.length === 0) {
    return c.json({ conversations: [] });
  }

  const searchRes = await searchProjectConversations(auth, {
    query,
    spaceIds: projectSpaces.map((s) => s.sId),
    topK: limit,
  });

  if (searchRes.isErr()) {
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

  return c.json({ conversations: results });
});

export default app;
