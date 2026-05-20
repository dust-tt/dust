import { buildTemplatePrompt } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/template.
const app = new Hono();

app.get("/", async (c) => {
  const templateId = c.req.query("templateId");
  if (!templateId) {
    return apiError(c, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: "The templateId query parameter is invalid or missing.",
      },
    });
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template || !template.sidekickInstructions) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: `Template with id ${templateId} not found.`,
      },
    });
  }

  return c.json(buildTemplatePrompt(template));
});

export default app;
