import { TemplateResource } from "@app/lib/resources/template_resource";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type FetchAgentTemplateResponse = ReturnType<TemplateResource["toJSON"]>;

const ParamsSchema = z.object({
  tId: z.string(),
});

// Mounted at /api/templates/:tId.
const app = createHono();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<FetchAgentTemplateResponse> => {
    const { tId: templateId } = ctx.req.valid("param");
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
  }
);

export default app;
