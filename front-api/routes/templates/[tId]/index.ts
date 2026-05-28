import { TemplateResource } from "@app/lib/resources/template_resource";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";

export type FetchAgentTemplateResponse = ReturnType<TemplateResource["toJSON"]>;

// Mounted at /api/templates/:tId.
const app = createHono();

app.get("/", async (ctx): HandlerResult<FetchAgentTemplateResponse> => {
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
