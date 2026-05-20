import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { setAgentUserFavorite } from "@app/lib/api/assistant/user_relation";
import type { PostAgentUserFavoriteResponseBody } from "@app/pages/api/w/[wId]/members/me/agent_favorite";
import { PostAgentUserFavoriteRequestBodySchema } from "@app/pages/api/w/[wId]/members/me/agent_favorite";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

// Mounted at /api/w/:wId/members/me/agent_favorite.
const app = new Hono();

app.post(
  "/",
  validate("json", PostAgentUserFavoriteRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { agentId, userFavorite } = ctx.req.valid("json");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent requested was not found.",
        },
      });
    }

    const result = await setAgentUserFavorite({
      auth,
      agentId,
      userFavorite,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json<PostAgentUserFavoriteResponseBody>(result.value);
  }
);

export default app;
