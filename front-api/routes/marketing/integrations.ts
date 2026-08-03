import { buildPublicIntegrationRegistry } from "@app/lib/api/marketing/integrations";
import { unauthedApp } from "@front-api/middlewares/ctx";

// Mounted at /api/marketing/integrations. No auth — public metadata consumed
// by the marketing site's integrations listing pages.
const app = unauthedApp();

const integrations = buildPublicIntegrationRegistry();

/** @ignoreswagger */
app.get("/", (ctx) => {
  return ctx.json({ integrations });
});

export default app;
