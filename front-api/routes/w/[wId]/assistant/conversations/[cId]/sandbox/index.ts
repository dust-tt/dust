import type { GetConversationSandboxResponseBody } from "@app/lib/api/assistant/conversation/sandbox";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/sandbox.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationSandboxResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversation = await ConversationResource.fetchById(auth, cId);
    if (!conversation) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "conversation_not_found",
          message: "The conversation you're trying to access was not found.",
        },
      });
    }

    const sandbox = await ConversationResource.fetchSandbox(auth, conversation);

    return ctx.json({
      sandboxStatus: sandbox?.status ?? null,
    });
  }
);

export default app;
