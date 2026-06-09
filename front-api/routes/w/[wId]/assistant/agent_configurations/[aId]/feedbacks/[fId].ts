import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getMessageConversationId } from "@app/lib/api/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { launchAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/client";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
  fId: z.string(),
});

const PatchBodySchema = z.object({
  dismissed: z.boolean(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/feedbacks/:fId.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId, fId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    if (!agentConfiguration.canEdit && !auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify agent feedback.",
        },
      });
    }

    const feedback = await AgentMessageFeedbackResource.fetchById(auth, {
      feedbackId: fId,
      agentConfigurationId: aId,
    });
    if (!feedback) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The feedback was not found.",
        },
      });
    }

    const { dismissed } = ctx.req.valid("json");

    if (dismissed) {
      await feedback.dismiss();
    } else {
      await feedback.undismiss();
    }

    const { conversationId, messageId: agentMessageId } =
      await getMessageConversationId(auth, {
        messageId: feedback.agentMessageId,
      });

    if (conversationId && agentMessageId) {
      await launchAgentMessageFeedbackWorkflow(auth, {
        message: { conversationId, agentMessageId },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
