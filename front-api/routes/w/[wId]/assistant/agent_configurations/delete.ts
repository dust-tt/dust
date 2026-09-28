import { AgentResource } from "@app/lib/resources/agent_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PostAgentConfigurationArchiveResponseBody = {
  archived: number;
};

const PostAgentConfigurationArchiveSchema = z.object({
  agentConfigurationIds: z.array(z.string()),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/delete.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostAgentConfigurationArchiveSchema),
  async (ctx): HandlerResult<PostAgentConfigurationArchiveResponseBody> => {
    const auth = ctx.get("auth");
    const { agentConfigurationIds } = ctx.req.valid("json");

    const agents = await AgentResource.fetchByIds(auth, agentConfigurationIds);
    const toDelete = agents.filter((a) => a.status === "active");
    if (toDelete.length !== agentConfigurationIds.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "One or more agent configurations were not found.",
        },
      });
    }
    // Checked for every agent before archiving any, so a rejected batch archives nothing.
    if (toDelete.some((agent) => !auth.can("admin", agent))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can delete workspace agent.",
        },
      });
    }

    for (const agent of toDelete) {
      const archiveResult = await agent.archive(auth);
      if (archiveResult.isErr()) {
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Could not archive one of the agent configurations.",
          },
        });
      }
    }

    return ctx.json({ archived: agents.length });
  }
);

export default app;
