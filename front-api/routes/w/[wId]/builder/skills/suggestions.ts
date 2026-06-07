import {
  getSkillDescriptionSuggestion,
  PostSkillSuggestionsRequestBodySchema,
} from "@app/lib/api/skills/description_suggestion";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

export type { PostSkillSuggestionsRequestBody } from "@app/lib/api/skills/description_suggestion";

// Mounted at /api/w/:wId/builder/skills/suggestions.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSkillSuggestionsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const inputs = ctx.req.valid("json");

    const suggestionRes = await getSkillDescriptionSuggestion(auth, inputs);
    if (suggestionRes.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: suggestionRes.error.message,
        },
      });
    }

    return ctx.json({ suggestion: suggestionRes.value });
  }
);

export default app;
