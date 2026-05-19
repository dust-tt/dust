import { Hono } from "hono";

import { listGlobalAgentFeedbacks } from "@app/lib/api/poke/global_agent_feedbacks";

// Re-exported for backward compatibility with client imports from the legacy
// Next path.
export type { GlobalAgentFeedbackItem } from "@app/lib/api/poke/global_agent_feedbacks";

// Mounted at /api/poke/global-agent-feedbacks. pokeAuth is applied by the
// parent poke sub-app.
const app = new Hono();

app.get("/", async (c) => {
  const includeEmptyQuery = c.req.query("includeEmpty");
  const lastIdQuery = c.req.query("lastId");

  const lastId =
    lastIdQuery !== undefined ? parseInt(lastIdQuery, 10) : undefined;

  const result = await listGlobalAgentFeedbacks({
    includeEmpty: includeEmptyQuery === "true",
    lastId,
  });

  return c.json(result);
});

export default app;
