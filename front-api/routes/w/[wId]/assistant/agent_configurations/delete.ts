import {
  archiveAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type PostAgentConfigurationArchiveResponseBody = {
  archived: number;
};

const PostAgentConfigurationArchiveSchema = z.object({
  agentConfigurationIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/delete.
const app = new Hono();

app.post(
  "/",
  validate("json", PostAgentConfigurationArchiveSchema),
  async (ctx): HandlerResult<PostAgentConfigurationArchiveResponseBody> => {
    const auth = ctx.get("auth");
    const { agentConfigurationIds } = ctx.req.valid("json");

    const agentConfigurations = await getAgentConfigurations(auth, {
      agentIds: agentConfigurationIds,
      variant: "extra_light",
    });
    const toDelete = agentConfigurations.filter((a) => a.status === "active");
    if (toDelete.length !== agentConfigurationIds.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "One or more agent configurations were not found.",
        },
      });
    }
    if (toDelete.some((agent) => !agent.canEdit && !auth.isAdmin())) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can delete workspace agent.",
        },
      });
    }

    for (const agentConfiguration of toDelete) {
      await archiveAgentConfiguration(auth, agentConfiguration.sId);
    }

    return ctx.json({ archived: agentConfigurations.length });
  }
);

export default app;
