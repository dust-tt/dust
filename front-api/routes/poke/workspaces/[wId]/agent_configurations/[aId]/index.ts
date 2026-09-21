import { AgentResource } from "@app/lib/resources/agent_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { ARCHIVED_AGENT_API_ERROR } from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
import { z } from "zod";

import details from "./details";
import exportRoute from "./export";
import observability from "./observability";
import restore from "./restore";

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/agent_configurations/:aId.
const app = pokeApp();

/** @ignoreswagger */
app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Could not find the agent configuration.",
        },
      });
    }

    if (agent.status === "archived") {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
    }

    const archiveResult = await agent.archive(auth);
    if (archiveResult.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Could not archive the agent configuration.",
        },
      });
    }

    return ctx.json({ success: true });
  }
);

app.route("/details", details);
app.route("/export", exportRoute);
app.route("/observability", observability);
app.route("/restore", restore);

export default app;
