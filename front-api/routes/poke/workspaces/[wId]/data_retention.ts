import type { PokeGetDataRetentionResponseBody } from "@app/lib/api/poke/data_retention";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
  getWorkspaceDataRetention,
} from "@app/lib/data_retention";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type { PokeGetDataRetentionResponseBody };

// Mounted at /api/poke/workspaces/:wId/data_retention.
const app = pokeApp();

/** @ignoreswagger */
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
