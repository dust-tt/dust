import { editAndResumeAction } from "@app/lib/api/assistant/conversation/edit_and_resume_action";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const EditAndSendActionSchema = z.object({
  actionId: z.string(),
  editedInputs: z.record(z.unknown()),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/edit-and-send-action.
const app = workspaceApp();

app.post("/", validate("json", EditAndSendActionSchema), async (ctx) => {
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

  const { actionId, editedInputs } = ctx.req.valid("json");

  const result = await editAndResumeAction(auth, conversation, {
    actionId,
    messageId: mId,
    editedInputs,
  });

  if (result.isErr()) {
    switch (result.error.code) {
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
      case "tool_not_editable":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      case "invalid_edited_inputs":
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: result.error.message,
          },
        });
      case "unauthorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
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
              message: "Failed to edit and send action",
            },
          },
          result.error
        );
    }
  }

  return ctx.json({ success: true });
});

export default app;
