import { getSkillIconSuggestion } from "@app/lib/api/skills/icon_suggestion";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

export const PostSkillSuggestionBodySchema = z.object({
  name: z.string().min(1, "Name is required."),
  userFacingDescription: z.string().min(1, "Description is required."),
  agentFacingDescription: z
    .string()
    .min(1, "What will this skill be used for is required."),
  instructions: z.string().min(1, "Instructions are required."),
  icon: z.string().nullable(),
  mcpServerViewIds: z.array(z.string()),
});

export type PostPokeSkillSuggestionResponseBody = {
  skill: SkillType;
};

// Mounted at /api/poke/workspaces/:wId/skills/suggestions.
const app = pokeApp();

app.post(
  "/",
  validate("json", PostSkillSuggestionBodySchema),
  async (ctx): HandlerResult<PostPokeSkillSuggestionResponseBody> => {
    const auth = ctx.get("auth");
    const {
      name,
      userFacingDescription,
      agentFacingDescription,
      instructions,
      icon,
      mcpServerViewIds,
    } = ctx.req.valid("json");

    let skillIcon = icon;

    if (!skillIcon) {
      const iconSuggestionResult = await getSkillIconSuggestion(auth, {
        name,
        agentFacingDescription,
        instructions,
      });
      if (iconSuggestionResult.isOk()) {
        skillIcon = iconSuggestionResult.value;
      }
    }

    const result = await SkillResource.makeSuggestion(
      auth,
      {
        name,
        userFacingDescription,
        agentFacingDescription,
        instructions,
        icon: skillIcon,
        extendedSkillId: null,
        isDefault: false,
      },
      {
        mcpServerViewIds,
      }
    );

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: `Failed to create skill suggestion: ${result.error.message}`,
        },
      });
    }

    return ctx.json({ skill: result.value.toJSON(auth) }, 201);
  }
);

export default app;
