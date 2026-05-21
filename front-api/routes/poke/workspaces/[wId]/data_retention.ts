import {
  type DataRetentionConfig,
  getAgentsDataRetention,
  getConversationsDataRetention,
  getWorkspaceDataRetention,
} from "@app/lib/data_retention";
import type { HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetDataRetentionResponseBody = {
  data: DataRetentionConfig;
};

// Mounted at /api/poke/workspaces/:wId/data_retention.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeGetDataRetentionResponseBody> => {
  const auth = ctx.get("auth");

  const workspaceRetention = await getWorkspaceDataRetention(auth);
  const convosRetention = await getConversationsDataRetention(auth);
  const agentsRetention = await getAgentsDataRetention(auth);

  return ctx.json({
    data: {
      workspace: workspaceRetention,
      conversations: convosRetention,
      agents: agentsRetention,
    },
  });
});

export default app;
