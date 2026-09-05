import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SearchConversationsResponseBody } from "@app/types/api/assistant/conversation/search";
import type { GetConversationsResponseBody } from "@app/types/api/assistant/conversation/types";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

// Mounted at /api/w/:wId/assistant/conversations/search.
const app = workspaceApp();

const SearchBodySchema = z.object({
  query: z.string().trim().min(1).max(1000),
  limit: z.number().int().min(1).max(100).default(20),
  lastValue: z.string().nullish(),
});

// Mobile clients send search text in the body so it does not appear in URLs.
// Keep GET available for existing clients. POST returns the standard list item
// representation, which omits internal model identifiers.
/** @ignoreswagger */
app.post(
  "/",
  validate("json", SearchBodySchema),
  async (ctx): HandlerResult<GetConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const { query, limit, lastValue } = ctx.req.valid("json");
    const result = await ConversationResource.searchByTitlePaginated(auth, {
      query,
      pagination: {
        limit,
        lastValue: lastValue ?? undefined,
        orderDirection: "desc",
      },
    });

    return ctx.json({
      conversations: result.conversations.map((conversation) =>
        conversation.toListItem()
      ),
      hasMore: result.hasMore,
      lastValue: result.lastValue,
    });
  }
);

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<SearchConversationsResponseBody> => {
  const auth = ctx.get("auth");

  // getPaginationParams expects a Next-style query object; flatten Hono's
  // query map (single-valued strings are fine here).
  const queryObj = ctx.req.query();
  const paginationRes = getPaginationParams(queryObj, {
    defaultLimit: 20,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
    maxLimit: 100,
  });

  if (paginationRes.isErr()) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: paginationRes.error.reason,
      },
    });
  }

  const query = ctx.req.query("query");
  if (!query || query.length === 0) {
    return apiError(ctx, {
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

  return ctx.json({
    conversations,
    hasMore: result.hasMore,
    lastValue: result.lastValue,
  });
});

export default app;
