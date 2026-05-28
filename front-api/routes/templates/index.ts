import { TemplateResource } from "@app/lib/resources/template_resource";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";

import template from "./[tId]";

export type AssistantTemplateListType = ReturnType<
  TemplateResource["toListJSON"]
>;

export interface FetchAssistantTemplatesResponse {
  templates: AssistantTemplateListType[];
}

// Mounted at /api/templates.
const app = createHono();

app.get("/", async (ctx): HandlerResult<FetchAssistantTemplatesResponse> => {
  const templates = await TemplateResource.listAll({
    visibility: "published",
  });

  return ctx.json({ templates: templates.map((t) => t.toListJSON()) });
});

app.route("/:tId", template);

export default app;
