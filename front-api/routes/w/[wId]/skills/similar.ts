import { getSimilarSkills } from "@app/lib/api/skills/existing_skill_checker";
import logger from "@app/logger/logger";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/skills/similar.
const app = workspaceApp();

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
  const owner = auth.getNonNullableWorkspace();

  const body = await ctx.req.json().catch(() => null);
  const naturalDescription = body?.naturalDescription;
  const excludeSkillId = body?.excludeSkillId;

  if (!isString(naturalDescription)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "naturalDescription is required and must be a string.",
      },
    });
  }

  if (excludeSkillId !== undefined && !isString(excludeSkillId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "excludeSkillId must be a string if provided.",
      },
    });
  }

  const result = await getSimilarSkills(auth, {
    naturalDescription,
    excludeSkillId: excludeSkillId ?? null,
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
