import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type GetSpaceUnreadConversationsResponseBody = {
  unreadConversationIds: string[];
};

// Mounted at /api/w/:wId/assistant/conversations/spaces/:spaceId/unread.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<GetSpaceUnreadConversationsResponseBody> => {
    const auth = ctx.get("auth");
    const spaceId = ctx.req.param("spaceId") ?? "";

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

    const unreadConversationIds =
      await ConversationResource.getSpaceUnreadConversationIds(auth, space.id);

    return ctx.json({ unreadConversationIds });
  }
);

export default app;
