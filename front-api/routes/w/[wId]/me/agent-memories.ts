import { listAgentMemoriesForCurrentUser } from "@app/lib/api/user_profile";
import type { GetMyAgentMemoriesResponseBody } from "@app/types/api/user_profile";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

// Mounted at /api/w/:wId/me/agent-memories. Lists only the authenticated user's own memories,
// grouped by agent. Other users' memories are never exposed.
const app = workspaceApp();

app.use(withFeatureFlag("user_profile"));

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetMyAgentMemoriesResponseBody> => {
  const auth = ctx.get("auth");

  const agentMemories = await listAgentMemoriesForCurrentUser(auth);

  return ctx.json({ agentMemories });
});

export default app;
