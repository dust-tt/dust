import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { getSkillDescriptionSuggestion } from "@app/lib/api/skills/description_suggestion";

import { validate } from "@front-api/middleware/validator";

const PostSkillSuggestionsRequestBodySchema = z.object({
  instructions: z.string(),
  agentFacingDescription: z.string(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })),
});

export type PostSkillSuggestionsRequestBody = z.infer<
  typeof PostSkillSuggestionsRequestBodySchema
>;

// Mounted at /api/w/:wId/builder/skills/suggestions.
const app = new Hono();

app.post(
  "/",
  validate("json", PostSkillSuggestionsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const inputs = c.req.valid("json");

    const suggestionRes = await getSkillDescriptionSuggestion(auth, inputs);
    if (suggestionRes.isErr()) {
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: suggestionRes.error.message,
        },
      });
    }

    return c.json({ suggestion: suggestionRes.value });
  }
);

export default app;
