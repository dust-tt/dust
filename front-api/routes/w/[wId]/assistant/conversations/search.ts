import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/search.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");

  // getPaginationParams expects a Next-style query object; flatten Hono's
  // query map (single-valued strings are fine here).
  const queryObj = c.req.query();
  const paginationRes = getPaginationParams(queryObj, {
    defaultLimit: 20,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
    maxLimit: 100,
  });

  if (paginationRes.isErr()) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const query = c.req.query("query");
  if (!query || query.length === 0) {
    return apiError(c, {
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

  const conversations = result.conversations.map((conv) => ({
    ...conv.toJSON(),
    spaceName: null,
  }));

  return c.json({
    conversations,
    hasMore: result.hasMore,
    lastValue: result.lastValue,
  });
});

export default app;
