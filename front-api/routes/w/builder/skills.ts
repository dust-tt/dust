import { Hono } from "hono";
import { z } from "zod";

import { getSkillDescriptionSuggestion } from "@app/lib/api/skills/description_suggestion";

import { validate } from "../../../middleware/validator";

const PostSkillSuggestionsRequestBodySchema = z.object({
  instructions: z.string(),
  agentFacingDescription: z.string(),
  tools: z.array(z.object({ name: z.string(), description: z.string() })),
});

export type PostSkillSuggestionsRequestBody = z.infer<
  typeof PostSkillSuggestionsRequestBodySchema
>;

// Mounted under /api/w/:wId/builder/skills.

export const skillsApp = new Hono();

skillsApp.post(
  "/suggestions",
  validate("json", PostSkillSuggestionsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const inputs = c.req.valid("json");

    const suggestionRes = await getSkillDescriptionSuggestion(auth, inputs);
    if (suggestionRes.isErr()) {
      return c.json(
        {
          error: {
            type: "internal_server_error",
            message: suggestionRes.error.message,
          },
        },
        500
      );
    }

    return c.json({ suggestion: suggestionRes.value });
  }
);
