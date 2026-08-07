import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import logger from "@app/logger/logger";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

// Mounted at /api/w/:wId/skills/similar.
const app = workspaceApp();

const PostSimilarSkillsBodySchema = z.object({
  naturalDescription: z.string(),
  excludeSkillId: z.string().optional(),
  availabilities: z.array(z.enum(SKILL_AVAILABILITIES)).nonempty().optional(),
});

/** @ignoreswagger */
app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const body = await ctx.req.json().catch(() => null);
  const bodyValidation = PostSimilarSkillsBodySchema.safeParse(body);

  if (!bodyValidation.success) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: fromError(bodyValidation.error).toString(),
      },
    });
  }

  const { naturalDescription, excludeSkillId, availabilities } =
    bodyValidation.data;

  const result = await getSimilarSkills(auth, {
    naturalDescription,
    excludeSkillId: excludeSkillId ?? null,
    availabilities,
  });

  if (result.isErr()) {
    logger.error(
      { error: result.error, workspaceId: owner.sId },
      "Error fetching similar skills"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: result.error.message,
      },
    });
  }
  const similarSkills = result.value.similar_skills;
  if (similarSkills.length > 0) {
    logger.info(
      {
        workspaceId: owner.sId,
        naturalDescription,
        similarSkills,
      },
      `Successfully fetched ${similarSkills.length} similar skills`
    );
  } else {
    logger.info(
      {
        workspaceId: owner.sId,
        naturalDescription,
      },
      "No similar skills found"
    );
  }

  return ctx.json(result.value);
});

export default app;
