import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export type SuggestResponseBody = {
  agentConfigurations: LightAgentConfigurationType[];
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/suggest.
// Kept alive for backward compatibility with older clients while the
// underlying suggestion feature has been removed.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<SuggestResponseBody> => {
  return ctx.json({ agentConfigurations: [] });
});

export default app;
