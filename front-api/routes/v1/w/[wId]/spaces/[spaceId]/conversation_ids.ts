import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetSpaceConversationIdsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsSystemKey } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  spaceId: z.string(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 * Returns only the conversation IDs (sIds) for conversations in a space.
 * Used for garbage collection to identify conversations that no longer exist.
 */

// Mounted at /api/v1/w/:wId/spaces/:spaceId/conversation_ids.
const app = publicApiApp();

app.use("*", ensureIsSystemKey());

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetSpaceConversationIdsResponseType> => {
    const auth = ctx.get("auth");
    const { spaceId } = ctx.req.valid("param");

    // Fetch and verify space exists
    const space = await SpaceResource.fetchById(auth, spaceId);
    if (!space) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Space not found.",
        },
      });
    }

    // Get all conversation IDs for the space (only visible/non-deleted conversations)
    // This endpoint is used for garbage collection to identify conversations that
    // were hard-deleted and no longer exist in the database
    const spaceConversations =
      await ConversationResource.listConversationsInSpace(auth, {
        spaceId,
        options: {
          dangerouslySkipPermissionFiltering: true, // System key has access
          // Don't include deleted - we only want conversations that still exist
          includeDeleted: false,
          // Don't include test conversations
          excludeTest: true,
        },
      });

    const conversationIds = spaceConversations.map((c) => c.sId);

    return ctx.json({
      conversationIds,
    });
  }
);

export default app;
