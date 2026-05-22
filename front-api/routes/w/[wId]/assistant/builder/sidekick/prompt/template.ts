import { buildTemplatePrompt } from "@app/lib/api/assistant/builder/sidekick_prompts";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/builder/sidekick/prompt/template.
const app = workspaceApp();

app.get("/", async (ctx) => {
  const templateId = ctx.req.query("templateId");
  if (!templateId) {
    return apiError(ctx, {
      status_code: 422,
      api_error: {
        type: "unprocessable_entity",
        message: "The templateId query parameter is invalid or missing.",
      },
    });
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template || !template.sidekickInstructions) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: `Template with id ${templateId} not found.`,
      },
    });
  }

  return ctx.json(buildTemplatePrompt(template));
});

export default app;
