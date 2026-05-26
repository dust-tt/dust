import { listSpaceConversationsForSync } from "@app/lib/api/assistant/conversation/fetch";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetSpaceConversationsForDataSourceResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
  spaceId: z.string(),
});

const QuerySchema = z.object({
  updatedSince: z.string().optional(),
});

/**
 * @ignoreswagger
 * System API key only endpoint. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/conversations.
const app = publicApiApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", QuerySchema),
  async (
    ctx
  ): HandlerResult<GetSpaceConversationsForDataSourceResponseType> => {
    const auth = ctx.get("auth");

    // Only allow system keys (connectors) to access this endpoint
    if (!auth.isSystemKey()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_oauth_token_error",
          message: "Only system keys are allowed to use this endpoint.",
        },
      });
    }

    const { wId, spaceId } = ctx.req.valid("param");
    const { updatedSince } = ctx.req.valid("query");
    const updatedSinceMs =
      updatedSince !== undefined ? parseInt(updatedSince, 10) : null;

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

    const conversations = await listSpaceConversationsForSync(auth, {
      spaceId,
      workspaceId: wId,
      updatedSinceMs,
    });

    return ctx.json({ conversations });
  }
);

export default app;
