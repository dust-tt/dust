import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getPaginationParams } from "@app/lib/api/pagination";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { LightConversationType } from "@app/types/assistant/conversation";
import { removeNulls } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  spaceId: z.string(),
});

export type GetSpaceConversationsResponseBody = {
  conversations: LightConversationType[];
  hasMore: boolean;
  lastValue: string | null;
  isEmpty: boolean;
};

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

import unread from "./unread";

// Mounted at /api/w/:wId/assistant/conversations/spaces/:spaceId.
const app = workspaceApp();

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
  }
);

app.route("/unread", unread);

export default app;
