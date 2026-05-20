import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/suggest.
// Kept alive for backward compatibility with older clients while the
// underlying suggestion feature has been removed.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<SuggestResponseBody> => {
  return ctx.json({ agentConfigurations: [] });
});

export default app;
