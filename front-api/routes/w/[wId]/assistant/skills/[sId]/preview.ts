import { previewSkillSuggestions } from "@app/lib/api/skills/apply_skill_suggestions";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { GetSkillSuggestionsPreviewResponseBody } from "@app/types/api/assistant/skills/suggestions";
import { GetSkillSuggestionsPreviewQuerySchema } from "@app/types/api/assistant/skills/suggestions";
import { skillApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/w/:wId/assistant/skills/:sId/preview.
// The `skill` context variable is set by the parent skills/[sId]/index.ts
// middleware, which also enforces `auth.can("admin", skill)`.
const app = skillApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("query", GetSkillSuggestionsPreviewQuerySchema),
  async (ctx): HandlerResult<GetSkillSuggestionsPreviewResponseBody> => {
    const auth = ctx.get("auth");
    const skill = ctx.get("skill");

    const { suggestionIds } = ctx.req.valid("query");

    const suggestions = await SkillSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );

    if (suggestions.length !== suggestionIds.length) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_suggestion_not_found",
          message: "One or more skill suggestions were not found.",
        },
      });
    }

    if (suggestions.some((s) => s.skillConfigurationSId !== skill.sId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "One or more skill suggestions do not belong to the specified skill configuration.",
        },
      });
    }

    const previewRes = previewSkillSuggestions(
      skill,
      suggestions.filter((s) => s.state === "pending")
    );
    if (previewRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: previewRes.error.message,
        },
      });
    }

    return ctx.json({ preview: previewRes.value });
  }
);

export default app;
