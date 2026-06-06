import type { FetchAgentTemplateResponse } from "@app/lib/resources/template_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

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
