import { Hono } from "hono";

import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

import { apiError } from "@front-api/middleware/utils";

export type PokeGetSkillSuggestionDetails = {
  suggestion: SkillSuggestionType;
  skillInstructionsHtml: string | null;
  skillAgentFacingDescription: string | null;
};

// Mounted at /api/poke/workspaces/:wId/skill_suggestions/:suggestionId/details.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const suggestionId = c.req.param("suggestionId");
  if (!suggestionId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid suggestion ID.",
      },
    });
  }

  const suggestion = await SkillSuggestionResource.fetchById(
    auth,
    suggestionId,
    { dangerouslyBypassConversationsVisibilityCheck: true }
  );
  if (!suggestion) {
    return apiError(c, {
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
  const body: PokeGetSkillSuggestionDetails = {
    suggestion: suggestion.toJSON(),
    skillInstructionsHtml: skillJson?.instructionsHtml ?? null,
    skillAgentFacingDescription: skillJson?.agentFacingDescription ?? null,
  };
  return c.json(body);
});

export default app;
