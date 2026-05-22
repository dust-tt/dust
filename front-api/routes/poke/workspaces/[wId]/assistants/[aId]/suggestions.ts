import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export type PokeListSuggestions = {
  suggestions: AgentSuggestionType[];
};

const DeleteSuggestionQuerySchema = z.object({
  sId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/assistants/:aId/suggestions.
const app = pokeApp();

app.get("/", async (ctx): HandlerResult<PokeListSuggestions> => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId");
  if (!aId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent ID.",
      },
    });
  }

  const suggestions = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    aId
  );

  return ctx.json({ suggestions: suggestions.map((s) => s.toJSON()) });
});

app.delete("/", validate("query", DeleteSuggestionQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { sId } = ctx.req.valid("query");

  const suggestion = await AgentSuggestionResource.fetchById(auth, sId);
  if (!suggestion) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The suggestion was not found.",
      },
    });
  }

  const deleteResult = await suggestion.delete(auth);
  if (deleteResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete suggestion.",
      },
    });
  }

  return ctx.body(null, 204);
});

export default app;
