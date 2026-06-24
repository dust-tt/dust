import { getLightConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getActivePlanContent } from "@app/lib/api/assistant/plan_mode";
import type { GetConversationPlanModeResponseBody } from "@app/types/api/assistant/plan_mode";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/plan_mode.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetConversationPlanModeResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const conversationRes = await getLightConversation(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const contentRes = await getActivePlanContent(auth, conversationRes.value);
    if (contentRes.isErr()) {
      // A missing plan is Ok(null); an Err here is a real read failure, surfaced not silenced.
      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to read the plan content.",
          },
        },
        contentRes.error
      );
    }

    return ctx.json({ content: contentRes.value });
  }
);

export default app;
