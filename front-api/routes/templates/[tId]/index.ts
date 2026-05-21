import { TemplateResource } from "@app/lib/resources/template_resource";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/templates/:tId.
const app = new Hono();

app.get("/", async (ctx) => {
  const templateId = ctx.req.param("tId");
  if (!templateId) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Template not found.",
      },
    });
  }

  const template = await TemplateResource.fetchByExternalId(templateId);
  if (!template || !template.isPublished()) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "template_not_found",
        message: "Template not found.",
      },
    });
  }

  return ctx.json(template.toJSON());
});

export default app;
