import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { PokeListSkillSuggestions } from "@app/types/api/poke/skills";
import { SKILL_SUGGESTION_SOURCES } from "@app/types/suggestions/skill_suggestion";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const DeleteSuggestionQuerySchema = z.object({
  suggestionSId: z.string(),
});

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/skills/:sId/suggestions.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeListSkillSuggestions> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(auth, sId, {
        sources: [...SKILL_SUGGESTION_SOURCES],
        dangerouslyBypassConversationsVisibilityCheck: true,
      });

    return ctx.json({ suggestions: suggestions.map((s) => s.toJSON()) });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("query", DeleteSuggestionQuerySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { suggestionSId } = ctx.req.valid("query");

    const suggestion = await SkillSuggestionResource.fetchById(
      auth,
      suggestionSId
    );
    if (!suggestion) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
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
  }
);

export default app;
