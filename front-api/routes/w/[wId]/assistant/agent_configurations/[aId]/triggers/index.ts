import { workspaceApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
  aId: z.string(),
});

// Deprecated: these endpoints moved to /api/w/:wId/triggers, with `aId` as a
// query param. The redirect keeps browser tabs running the previous bundle
// working across the deploy; delete this route once that has rolled out.
const app = workspaceApp();

/** @ignoreswagger */
app.all("/*", validate("param", ParamsSchema), (ctx) => {
  const { wId, aId } = ctx.req.valid("param");

  const url = new URL(ctx.req.url);
  const marker = `/agent_configurations/${aId}/triggers`;
  const suffix = url.pathname.slice(
    url.pathname.indexOf(marker) + marker.length
  );

  url.pathname = `/api/w/${wId}/triggers${suffix}`;
  url.searchParams.set("aId", aId);

  return ctx.redirect(`${url.pathname}${url.search}`, 307);
});

export default app;
