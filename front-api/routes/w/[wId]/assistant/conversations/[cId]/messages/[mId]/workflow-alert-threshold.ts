import {
  continueWorkflowAlertThresholdPause,
  declineWorkflowAlertThresholdPause,
} from "@app/lib/api/assistant/conversation/workflow_alert_threshold_pause";
import { DustError } from "@app/lib/error";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { Result } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  mId: z.string(),
});

const WorkflowAlertThresholdDecisionSchema = z.object({
  decision: z.enum(["continue", "decline"]),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/messages/:mId/workflow-alert-threshold.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", WorkflowAlertThresholdDecisionSchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { cId, mId } = ctx.req.valid("param");

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

    const { decision } = ctx.req.valid("json");

    let result: Result<void, DustError | Error>;
    switch (decision) {
      case "continue":
        result = await continueWorkflowAlertThresholdPause(auth, conversation, {
          messageId: mId,
        });
        break;
      case "decline":
        result = await declineWorkflowAlertThresholdPause(auth, conversation, {
          messageId: mId,
        });
        break;
      default:
        assertNever(decision);
    }

    if (result.isErr()) {
      const { error } = result;

      if (error instanceof DustError) {
        switch (error.code) {
          case "agent_message_not_resumable":
            return apiError(ctx, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          case "unauthorized":
            return apiError(ctx, {
              status_code: 403,
              api_error: {
                type: "invalid_request_error",
                message: error.message,
              },
            });
          default:
            break;
        }
      }

      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to resolve the workflow alert threshold pause.",
          },
        },
        error
      );
    }

    return ctx.json({ success: true });
  }
);

export default app;
