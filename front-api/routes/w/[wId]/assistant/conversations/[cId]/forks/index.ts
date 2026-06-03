import { createConversationFork } from "@app/lib/api/assistant/conversation/forks";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
});

const PostConversationForkBodySchema = z.object({
  sourceMessageId: z.string().optional(),
});

export type PostConversationForkResponseBody = {
  conversationId: string;
  parentConversationTitle: string | null;
  spaceId: string | null;
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/forks.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostConversationForkBodySchema),
  async (ctx): HandlerResult<PostConversationForkResponseBody> => {
    const auth = ctx.get("auth");
    const { cId } = ctx.req.valid("param");

    const { sourceMessageId } = ctx.req.valid("json");

    const createRes = await createConversationFork(auth, {
      conversationId: cId,
      sourceMessageId,
    });

    if (createRes.isErr()) {
      switch (createRes.error.code) {
        case "conversation_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "conversation_not_found",
              message: createRes.error.message,
            },
          });
        case "unauthorized":
          return apiError(ctx, {
            status_code: 403,
            api_error: {
              type: "workspace_auth_error",
              message: createRes.error.message,
            },
          });
        case "invalid_request_error":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: createRes.error.message,
            },
          });
        case "internal_error":
        case "failed_to_copy_files":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: createRes.error.message,
            },
          });
        default:
          assertNever(createRes.error.code);
      }
    }

    return ctx.json({
      conversationId: createRes.value.conversationId,
      parentConversationTitle: createRes.value.parentConversationTitle,
      spaceId: createRes.value.spaceId,
    });
  }
);

export default app;
