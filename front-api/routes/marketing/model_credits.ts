import { buildPublicModelCredits } from "@app/lib/api/marketing/model_credits";
import { unauthedApp } from "@front-api/middlewares/ctx";

// Mounted at /api/marketing/model-credits. No auth — public metadata
// consumed by the marketing site's credits pricing page.
const app = unauthedApp();

const models = buildPublicModelCredits();

/** @ignoreswagger */
app.get("/", (ctx) => {
  return ctx.json({ models });
});

export default app;
