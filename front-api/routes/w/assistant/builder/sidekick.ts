import { Hono } from "hono";

import {
  buildExistingAgentPrompt,
  buildShrinkWrapPromptForConversation,
  buildTemplatePrompt,
} from "@app/lib/api/assistant/builder/sidekick_prompts";
import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import { TemplateResource } from "@app/lib/resources/template_resource";

import { jsonApiError } from "../../../../middleware/utils";

// Mounted under /api/w/:wId/assistant/builder/sidekick.

export const sidekickApp = new Hono();

sidekickApp.get("/prompt/template", async (c) => {
  const templateId = c.req.query("templateId");
  if (!templateId) {
    return c.json(
      {
        error: {
          type: "unprocessable_entity",
          message: "The templateId query parameter is invalid or missing.",
        },
      },
      422
    );
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template || !template.sidekickInstructions) {
    return c.json(
      {
        error: {
          type: "template_not_found",
          message: `Template with id ${templateId} not found.`,
        },
      },
      404
    );
  }

  return c.json(buildTemplatePrompt(template));
});

sidekickApp.get("/prompt/existing", async (c) => {
  const auth = c.get("auth");
  const agentConfigurationId = c.req.query("agentConfigurationId");
  if (!agentConfigurationId) {
    return c.json(
      {
        error: {
          type: "unprocessable_entity",
          message:
            "The agentConfigurationId query parameter is invalid or missing.",
        },
      },
      422
    );
  }

  return c.json(await buildExistingAgentPrompt(auth, agentConfigurationId));
});

sidekickApp.get("/prompt/shrink-wrap", async (c) => {
  const auth = c.get("auth");
  const conversationId = c.req.query("conversationId");
  if (!conversationId) {
    return c.json(
      {
        error: {
          type: "unprocessable_entity",
          message: "The conversationId query parameter is invalid or missing.",
        },
      },
      422
    );
  }

  const result = await buildShrinkWrapPromptForConversation(
    auth,
    conversationId
  );
  if (result.isErr()) {
    return jsonApiError(c, getConversationApiError(result.error));
  }
  return c.json(result.value);
});
