import { TemplateResource } from "@app/lib/resources/template_resource";
import { Hono } from "hono";

import template from "./[tId]";

// Mounted at /api/templates.
const app = new Hono();

app.get("/", async (ctx) => {
  const templates = await TemplateResource.listAll({
    visibility: "published",
  });

  return ctx.json({ templates: templates.map((t) => t.toListJSON()) });
});

app.route("/:tId", template);

export default app;
