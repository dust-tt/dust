import { getSkillDescriptionSuggestion } from "@app/lib/api/skills/description_suggestion";
import { workspaceApp } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { z } from "zod";

const PostSkillSuggestionsRequestBodySchema = z.object({
  instructions: z.string(),
  agentFacingDescription: z.string(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })),
});

export type PostSkillSuggestionsRequestBody = z.infer<
  typeof PostSkillSuggestionsRequestBodySchema
>;

// Mounted at /api/w/:wId/builder/skills/suggestions.
const app = workspaceApp();

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
