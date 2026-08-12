import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import { launchSkillSearchIndexation } from "@app/lib/skill_search/indexation";
import type { DeleteSkillResponseBody } from "@app/types/api/skills";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { ensureIsBuilder } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  skillId: z.string(),
});

// Mounted at /api/v1/w/:wId/skills/:skillId.
const app = publicApiApp();

/**
 * @swagger
 * /api/v1/w/{wId}/skills/{skillId}:
 *   delete:
 *     summary: Archive a skill
 *     description: Soft-archives a custom skill in the workspace.
 *     tags:
 *       - Skills
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: path
 *         name: skillId
 *         required: true
 *         description: Unique string identifier for the custom skill
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Skill archived successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - success
 *               properties:
 *                 success:
 *                   type: boolean
 *       401:
 *         description: Unauthorized. Invalid or missing authentication token.
 *       403:
 *         description: Forbidden. The caller is not allowed to archive skills.
 *       404:
 *         description: Skill not found.
 *       500:
 *         description: Internal Server Error.
 */
app.delete(
  "/",
  ensureIsBuilder(),
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<DeleteSkillResponseBody> => {
    const auth = ctx.get("auth");
    const { skillId } = ctx.req.valid("param");

    const skill = isResourceSId("skill", skillId)
      ? await SkillResource.fetchById(auth, skillId)
      : null;

    if (!skill) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill you requested was not found.",
        },
      });
    }

    if (!skill.canAdministrate(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only admins and editors can archive this skill.",
        },
      });
    }

    const { affectedCount } = await skill.archive(auth);
    if (affectedCount > 0) {
      await launchSkillSearchIndexation({
        workspaceId: auth.getNonNullableWorkspace().sId,
        skillId: skill.sId,
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
