import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillEnv, WorkspaceAuthEnv } from "@front-api/middleware/env";
import { apiError } from "@front-api/middleware/utils";
import { createMiddleware } from "hono/factory";

/**
 * Fetches `SkillResource` named by `:sId`, enforces `canWrite`, and stashes
 * it on `ctx.var.skill`. Apply after `workspaceAuth` so `ctx.get("auth")` is
 * available.
 */
export const withSkill = createMiddleware<WorkspaceAuthEnv & SkillEnv>(
  async (ctx, next) => {
    const auth = ctx.get("auth");
    const sId = ctx.req.param("sId") ?? "";

    const skill = await SkillResource.fetchById(auth, sId);
    if (!skill) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill configuration was not found.",
        },
      });
    }

    if (!skill.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the skill or workspace admins can view suggestions.",
        },
      });
    }

    ctx.set("skill", skill);
    await next();
  }
);
