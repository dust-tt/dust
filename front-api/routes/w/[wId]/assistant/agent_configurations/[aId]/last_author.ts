import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { UserResource } from "@app/lib/resources/user_resource";
import type { UserType } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

export type GetAgentLastAuthorResponseBody = {
  user: UserType | null;
};

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/last_author.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetAgentLastAuthorResponseBody> => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent you're trying to access was not found.",
      },
    });
  }

  if (!agentConfiguration.versionAuthorId) {
    return ctx.json({ user: null });
  }

  const agentLastAuthor = await UserResource.fetchByModelIds([
    agentConfiguration.versionAuthorId,
  ]);

  return ctx.json({
    user: agentLastAuthor[0] ? agentLastAuthor[0].toJSON() : null,
  });
});

export default app;
