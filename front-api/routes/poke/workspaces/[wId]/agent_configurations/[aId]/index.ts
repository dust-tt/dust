import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
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

app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "Could not find the agent configuration.",
        },
      });
    }

    await archiveAgentConfiguration(auth, agentConfiguration.sId);

    return ctx.json({ success: true });
  }
);

app.route("/details", details);
app.route("/export", exportRoute);
app.route("/observability", observability);
app.route("/restore", restore);

export default app;
