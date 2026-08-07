import { getPaginationParams } from "@app/lib/api/pagination";
import { toPodConversationListItem } from "@app/lib/api/projects/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GetSpaceConversationsResponseBody } from "@app/types/api/assistant/conversation/spaces";
import { pokeProjectApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/workspaces/:wId/projects/:projectId/conversations.
const app = pokeProjectApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetSpaceConversationsResponseBody> => {
  const auth = ctx.get("auth");
  const space = ctx.get("space");

  const paginationRes = getPaginationParams(ctx.req.query(), {
    defaultLimit: 20,
    defaultOrderColumn: "updatedAt",
    defaultOrderDirection: "desc",
    supportedOrderColumn: ["updatedAt"],
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

  const pagination = paginationRes.value;
  const {
    conversations: conversationResources,
    hasMore,
    lastValue,
  } = await ConversationResource.listConversationsInSpacePaginated(auth, {
    spaceId: space.sId,
    options: { excludeTest: true },
    pagination: {
      limit: pagination.limit,
      lastValue: pagination.lastValue,
      orderDirection: pagination.orderDirection,
    },
  });

  const conversations = await toPodConversationListItem(auth, {
    conversations: conversationResources,
  });

  return ctx.json({
    conversations,
    hasMore,
    lastValue,
    isEmpty: !pagination.lastValue && conversations.length === 0,
  });
});

export default app;
