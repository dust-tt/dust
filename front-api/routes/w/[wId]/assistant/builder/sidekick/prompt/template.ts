import { Hono } from "hono";

import { buildTemplatePrompt } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { TemplateResource } from "@app/lib/resources/template_resource";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/template.
const app = new Hono();

app.get("/", async (c) => {
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

export default app;
