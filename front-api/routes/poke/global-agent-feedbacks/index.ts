import type { GlobalAgentFeedbackItem } from "@app/lib/api/poke/global_agent_feedbacks";
import { listGlobalAgentFeedbacks } from "@app/lib/api/poke/global_agent_feedbacks";
import { pokeApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";

export interface GetGlobalAgentFeedbacksResponseBody {
  feedbacks: GlobalAgentFeedbackItem[];
  hasMore: boolean;
}

// Mounted at /api/poke/global-agent-feedbacks. pokeAuth is applied by the
// parent poke sub-app.
const app = pokeApp();

app.get(
  "/",
  async (ctx): HandlerResult<GetGlobalAgentFeedbacksResponseBody> => {
    const includeEmptyQuery = ctx.req.query("includeEmpty");
    const lastIdQuery = ctx.req.query("lastId");

    const lastId =
      lastIdQuery !== undefined ? parseInt(lastIdQuery, 10) : undefined;

    const result = await listGlobalAgentFeedbacks({
      includeEmpty: includeEmptyQuery === "true",
      lastId,
    });

    return ctx.json(result);
  }
);

export default app;
