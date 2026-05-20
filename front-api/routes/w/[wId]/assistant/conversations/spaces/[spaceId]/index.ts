import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

type SpaceConversationsFilter = "all" | "group" | "with_me";

function parseFilter(value: string | undefined): SpaceConversationsFilter {
  switch (value) {
    case "all":
    case "group":
    case "with_me":
      return value;
    default:
      return "all";
  }
}

// Mounted at /api/w/:wId/assistant/conversations/spaces/:spaceId.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const spaceId = ctx.req.param("spaceId") ?? "";

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
  const conversationFilter = parseFilter(ctx.req.query("filter"));

  // Fetch and verify space access.
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space || !space.canReadOrAdministrate(auth)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "Space not found or access denied",
      },
    });
  }

  // Get paginated conversations for the space.
  const {
    conversations: spaceConversations,
    hasMore,
    lastValue,
  } = await ConversationResource.listConversationsInSpacePaginated(auth, {
    spaceId,
    options: { excludeTest: true },
    pagination: {
      limit: pagination.limit,
      lastValue: pagination.lastValue,
      orderDirection: pagination.orderDirection,
    },
    filter: conversationFilter,
  });

  const { conversations: allConversations } =
    await ConversationResource.listConversationsInSpacePaginated(auth, {
      spaceId,
      options: { excludeTest: true },
      pagination: {
        limit: 1,
        orderDirection: pagination.orderDirection,
      },
      filter: "all",
    });
  const isEmpty = allConversations.length === 0;

  // Fetch full conversation details for the paginated results.
  // N+1 queries here, bad for scaling — TODO(@jd) find a better way.
  const spaceConversationsFull = await concurrentExecutor(
    spaceConversations,
    async (conv) => getLightConversation(auth, conv.sId),
    { concurrency: 10 }
  );

  return ctx.json({
    conversations: removeNulls(
      spaceConversationsFull.map((res) => (res.isOk() ? res.value : null))
    ),
    hasMore,
    lastValue,
    isEmpty,
  });
});

export default app;
