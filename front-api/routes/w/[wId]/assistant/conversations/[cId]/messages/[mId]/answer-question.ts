import { UserQuestionAnswerSchema } from "@app/lib/actions/types";
import { registerUserAnswer } from "@app/lib/api/assistant/conversation/answer_user_question";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

const AnswerQuestionRequestSchema = z.object({
  actionId: z.string(),
  answer: UserQuestionAnswerSchema,
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/answer-question.
const app = workspaceApp();

app.post("/", validate("json", AnswerQuestionRequestSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";
  const mId = ctx.req.param("mId") ?? "";

  const conversation = await ConversationResource.fetchById(auth, cId);
  if (!conversation) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  const { actionId, answer } = ctx.req.valid("json");

  const result = await registerUserAnswer(auth, conversation, {
    actionId,
    messageId: mId,
    answer,
  });

  if (result.isErr()) {
    switch (result.error.code) {
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: result.error.message,
          },
        });
      case "action_not_blocked":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "action_not_blocked",
            message: result.error.message,
          },
        });
      case "action_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "action_not_found",
            message: result.error.message,
          },
        });
      default:
        return apiError(
          ctx,
          {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: "Failed to answer question",
            },
          },
          result.error
        );
    }
  }

  return ctx.json({ success: true });
});

export default app;
