import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/suggest.
// Kept alive for backward compatibility with older clients while the
// underlying suggestion feature has been removed.
const app = new Hono();

app.get("/", async (ctx) => {
  return ctx.json({ agentConfigurations: [] });
});

export default app;
