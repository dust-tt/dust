import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { PokeGetSkillSuggestionDetails } from "@app/types/api/poke/skills";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  suggestionId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/skill_suggestions/:suggestionId/details.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetSkillSuggestionDetails> => {
    const auth = ctx.get("auth");
    const { suggestionId } = ctx.req.valid("param");

    const suggestion = await SkillSuggestionResource.fetchById(
      auth,
      suggestionId,
      { dangerouslyBypassConversationsVisibilityCheck: true }
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

    const skill = await SkillResource.fetchById(
      auth,
      suggestion.skillConfigurationSId
    );

    const skillJson = skill?.toJSON(auth);
    return ctx.json({
      suggestion: suggestion.toJSON(),
      skillInstructionsHtml: skillJson?.instructionsHtml ?? null,
      skillAgentFacingDescription: skillJson?.agentFacingDescription ?? null,
    });
  }
);

export default app;
