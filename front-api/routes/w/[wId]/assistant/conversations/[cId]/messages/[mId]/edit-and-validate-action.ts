import { editAndValidateAction } from "@app/lib/api/assistant/conversation/edit_and_validate_action";
import { hasFeatureFlag } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const EditAndValidateActionSchema = z.object({
  actionId: z.string(),
  approvalState: z.enum(["approved", "always_approved", "rejected"]),
  editedArguments: z.record(z.string(), z.unknown()),
  resumeAncestorConversations: z.boolean().optional(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/edit-and-validate-action.
const app = workspaceApp();

/**
 * @ignoreswagger
 */

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", EditAndValidateActionSchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const hasEditableToolInputs = await hasFeatureFlag(
      auth,
      "editable_tool_inputs"
    );
    if (!hasEditableToolInputs) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: "Editing tool inputs is not enabled for this workspace.",
        },
      });
    }

    const { cId, mId } = ctx.req.valid("param");
    const {
      actionId,
      approvalState,
      editedArguments,
      resumeAncestorConversations,
    } = ctx.req.valid("json");

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

    const result = await editAndValidateAction(auth, conversation, {
      actionId,
      approvalState,
      editedArguments,
      messageId: mId,
      resumeAncestorConversations,
    });

    if (result.isErr()) {
      switch (result.error.code) {
        case "action_not_blocked":
        case "action_not_editable":
        case "invalid_edited_arguments":
          return apiError(ctx, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        case "action_not_found":
          return apiError(ctx, {
            status_code: 404,
            api_error: {
              type: "invalid_request_error",
              message: result.error.message,
            },
          });
        case "internal_error":
          return apiError(ctx, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: result.error.message,
            },
          });
        default:
          assertNever(result.error.code);
      }
    }

    return ctx.json({ success: true });
  }
);

export default app;
