import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { launchSkillSearchIndexation } from "@app/lib/skill_search/indexation";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import uniq from "lodash/uniq";
import { z } from "zod";

const MAX_SKILLS_PER_BATCH = 1000;

const PostSkillsArchiveBodySchema = z.object({
  skillIds: z.array(z.string()).min(1).max(MAX_SKILLS_PER_BATCH),
});

export type PostSkillsArchiveResponseBody = {
  archived: number;
};

// Mounted at /api/w/:wId/skills/archive.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", PostSkillsArchiveBodySchema),
  async (ctx): HandlerResult<PostSkillsArchiveResponseBody> => {
    const auth = ctx.get("auth");
    const { skillIds: requestedSkillIds } = ctx.req.valid("json");
    const skillIds = uniq(requestedSkillIds);

    const invalidSkillIds = skillIds.filter(
      (skillId) => !isResourceSId("skill", skillId)
    );
    if (invalidSkillIds.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Only custom skills can be archived: ${invalidSkillIds.join(", ")}.`,
        },
      });
    }

    const skills = await SkillResource.fetchByIds(auth, skillIds, {
      onlyActive: true,
    });
    const foundSkillIds = new Set(skills.map((skill) => skill.sId));
    const missingSkillIds = skillIds.filter(
      (skillId) => !foundSkillIds.has(skillId)
    );
    if (missingSkillIds.length > 0) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: `Skills not found: ${missingSkillIds.join(", ")}.`,
        },
      });
    }

    if (skills.some((skill) => !skill.canAdministrate(auth))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins and editors can archive skills.",
        },
      });
    }

    // Archiving a skill updates its dependent agents, parent skills, and editor
    // memberships in one transaction, so preserve that resource-level operation.
    for (const skill of skills) {
      const { affectedCount } = await skill.archive(auth);
      if (affectedCount > 0) {
        await launchSkillSearchIndexation({
          workspaceId: auth.getNonNullableWorkspace().sId,
          skillId: skill.sId,
        });
      }
    }

    return ctx.json({ archived: skills.length });
  }
);

export default app;
