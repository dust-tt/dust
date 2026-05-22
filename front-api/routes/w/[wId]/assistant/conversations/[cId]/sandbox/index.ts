import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SandboxStatus } from "@app/lib/resources/storage/models/sandbox";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetConversationSandboxResponseBody = {
  sandboxStatus: SandboxStatus | null;
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/sandbox.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetConversationSandboxResponseBody> => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";

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

  const sandbox = await SandboxResource.fetchByConversationId(auth, cId);

  return ctx.json({
    sandboxStatus: sandbox?.status ?? null,
  });
});

export default app;
