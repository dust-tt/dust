import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";
import { SKILL_SUGGESTION_SOURCES } from "@app/types/suggestions/skill_suggestion";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

export type PokeListSkillSuggestions = {
  suggestions: SkillSuggestionType[];
};

const DeleteSuggestionQuerySchema = z.object({
  suggestionSId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/skills/:sId/suggestions.
const app = new Hono();

app.get("/", async (ctx) => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");
  if (!sId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const suggestions = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    sId,
    {
      sources: [...SKILL_SUGGESTION_SOURCES],
      dangerouslyBypassConversationsVisibilityCheck: true,
    }
  );

  const body: PokeListSkillSuggestions = {
    suggestions: suggestions.map((s) => s.toJSON()),
  };
  return ctx.json(body);
});

app.delete("/", validate("query", DeleteSuggestionQuerySchema), async (ctx) => {
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
});

export default app;
