import type { GetGlobalAgentFeedbacksResponseBody } from "@app/lib/api/poke/global_agent_feedbacks";
import { listGlobalAgentFeedbacks } from "@app/lib/api/poke/global_agent_feedbacks";
import { parseOptionalInt } from "@app/lib/utils/parseOptionalInt";
import { pokeApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

// Mounted at /api/poke/global-agent-feedbacks. pokeAuth is applied by the
// parent poke sub-app.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  async (ctx): HandlerResult<GetGlobalAgentFeedbacksResponseBody> => {
    const result = await listGlobalAgentFeedbacks({
      includeEmpty: ctx.req.query("includeEmpty") === "true",
      lastId: parseOptionalInt(ctx.req.query("lastId")),
    });

    return ctx.json(result);
  }
);

export default app;
