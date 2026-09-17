import { AgentResource } from "@app/lib/resources/agent_resource";
import type { PostAgentUserFavoriteResponseBody } from "@app/types/api/assistant/user_relation";
import { PostAgentUserFavoriteRequestBodySchema } from "@app/types/api/assistant/user_relation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/members/me/agent_favorite.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostAgentUserFavoriteRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { agentId, userFavorite } = ctx.req.valid("json");

    const agent = await AgentResource.fetchById(auth, agentId);

    if (!agent || !auth.can("read", agent)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent requested was not found.",
        },
      });
    }

    const result = await agent.setUserFavorite(auth, userFavorite);

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json<PostAgentUserFavoriteResponseBody>({
      agentId,
      userFavorite,
    });
  }
);

export default app;
