import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getMessageConversationId } from "@app/lib/api/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { launchAgentMessageFeedbackWorkflow } from "@app/temporal/analytics_queue/client";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PatchBodySchema = z.object({
  dismissed: z.boolean(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/feedbacks/:fId.
const app = new Hono();

app.patch("/", validate("json", PatchBodySchema), async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";
  const fId = c.req.param("fId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  if (!agentConfiguration.canEdit && !auth.isBuilder()) {
    return apiError(c, {
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
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The feedback was not found.",
      },
    });
  }

  const { dismissed } = c.req.valid("json");

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

  return c.json({ success: true });
});

export default app;
