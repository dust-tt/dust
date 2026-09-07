import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isResourceSId } from "@app/lib/resources/string_ids";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { SKILL_AVAILABILITIES } from "@app/types/assistant/skill_configuration";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { rejectArchivedSkills } from "@front-api/routes/w/[wId]/skills/guards";
import uniq from "lodash/uniq";
import { z } from "zod";

const MAX_SKILLS_PER_BATCH = 1000;

const PatchSkillsAvailabilityBodySchema = z.object({
  skillIds: z.array(z.string()).min(1).max(MAX_SKILLS_PER_BATCH),
  availability: z.enum(SKILL_AVAILABILITIES),
});

export type PatchSkillsAvailabilityResponseBody = {
  skills: SkillType[];
};

// Mounted at /api/w/:wId/skills/availability.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("json", PatchSkillsAvailabilityBodySchema),
  async (ctx): HandlerResult<PatchSkillsAvailabilityResponseBody> => {
    const auth = ctx.get("auth");
    const body = ctx.req.valid("json");
    const { availability } = body;
    const skillIds = uniq(body.skillIds);

    if (!(await auth.hasWorkspacePermission("publish", "skill"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "You don't have permission to change skill availability.",
        },
      });
    }

    const canMakeDiscoverable = await auth.hasWorkspacePermission(
      "make_discoverable",
      "skill"
    );

    if (availability === "users_and_agents" && !canMakeDiscoverable) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "You don't have permission to make skills auto-discoverable.",
        },
      });
    }

    // Code-defined skills have a fixed availability.
    const invalidSkillIds = skillIds.filter(
      (skillId) => !isResourceSId("skill", skillId)
    );
    if (invalidSkillIds.length > 0) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Only custom skills can have their availability changed: ${invalidSkillIds.join(", ")}.`,
        },
      });
    }

    // Admins can change the availability of the skills built on spaces they are not a member of
    // (listed to them redacted), so those are fetched too.
    const permissionFiltering = auth.isAdmin() ? "redact_unreadable" : "strict";
    const skills = await SkillResource.fetchByIds(auth, skillIds, {
      permissionFiltering,
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

    const archivedError = rejectArchivedSkills(ctx, skills);
    if (archivedError) {
      return archivedError;
    }

    // Changing an already auto-discoverable skill's availability also requires the
    // make-discoverable permission.
    if (availability !== "users_and_agents" && !canMakeDiscoverable) {
      const autoDiscoverableSkillNames = skills
        .filter((skill) => skill.availability === "users_and_agents")
        .map((skill) => skill.name);
      if (autoDiscoverableSkillNames.length > 0) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: `You don't have permission to change the availability of auto-discoverable skills: ${autoDiscoverableSkillNames.join(", ")}.`,
          },
        });
      }
    }

    await SkillResource.updateAvailabilities(auth, skills, availability);

    // Re-fetch: the bulk update does not refresh the in-memory resources.
    const updatedSkills = await SkillResource.fetchByIds(auth, skillIds, {
      permissionFiltering,
    });

    return ctx.json({
      skills: updatedSkills.map((skill) => skill.toJSON(auth)),
    });
  }
);

export default app;
