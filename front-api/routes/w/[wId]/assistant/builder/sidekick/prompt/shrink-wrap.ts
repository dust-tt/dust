import { buildShrinkWrapPromptForConversation } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/shrink-wrap.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const conversationId = ctx.req.query("conversationId");
  if (!conversationId) {
    return apiError(ctx, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: "The conversationId query parameter is invalid or missing.",
      },
    });
  }

  const result = await buildShrinkWrapPromptForConversation(
    auth,
    conversationId
  );
  if (result.isErr()) {
    return apiErrorForConversation(ctx, result.error);
  }
  return ctx.json(result.value);
});

export default app;
