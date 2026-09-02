import { getPaginationParams } from "@app/lib/api/pagination";
import { toPodConversationListItem } from "@app/lib/api/projects/conversations";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetSpaceConversationsResponseBody } from "@app/types/api/assistant/conversation/spaces";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import unread from "./unread";

const ParamsSchema = z.object({
  spaceId: z.string(),
});

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
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetSpaceConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const { spaceId } = ctx.req.valid("param");

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
    const excludeTriggered = ctx.req.query("excludeTriggered") === "true";

    // Fetch and verify space access.
    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space || (!auth.can("read", space) && !auth.can("admin", space))) {
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
      excludeTriggered,
    });

    let isEmpty = spaceConversations.length === 0;

    // If the page is empty, check if there are any conversations in the space.
    if (isEmpty) {
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
      isEmpty = allConversations.length === 0;
    }

    const conversations = await toPodConversationListItem(auth, {
      conversations: spaceConversations,
    });

    return ctx.json({
      conversations,
      hasMore,
      lastValue,
      isEmpty,
    });
  }
);

app.route("/unread", unread);

export default app;
