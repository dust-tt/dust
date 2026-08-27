import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { apiError } from "@front-api/middlewares/utils";
import type { Context } from "hono";

// `apiError` returns a typed JSON response the route handlers' `HandlerResult` expects; keep that
// type rather than widening it to `Response`.
type ApiErrorResponse = ReturnType<typeof apiError>;

// An archived skill is frozen: POST /skills/:sId/restore is the only change it accepts. Every
// mutation route runs this check, so archiving cannot be worked around one endpoint at a time —
// and re-archiving cannot rename a skill after itself (`archive` renames the same-named archived
// skill it finds, which would be this very one).
//
// Returns the error response to hand back, or null when the skill can be mutated.
export function rejectArchivedSkill(
  ctx: Context,
  skill: SkillResource
): ApiErrorResponse | null {
  if (skill.status !== "archived") {
    return null;
  }

  return apiError(ctx, {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: "An archived skill cannot be updated. Restore it first.",
    },
  });
}

// The batch counterpart of `rejectArchivedSkill`: nothing is applied unless every skill is
// mutable, so a batch never lands half-way.
export function rejectArchivedSkills(
  ctx: Context,
  skills: SkillResource[]
): ApiErrorResponse | null {
  const archivedSkillNames = skills
    .filter((skill) => skill.status === "archived")
    .map((skill) => skill.name);
  if (archivedSkillNames.length === 0) {
    return null;
  }

  return apiError(ctx, {
    status_code: 400,
    api_error: {
      type: "invalid_request_error",
      message: `Archived skills cannot be updated: ${archivedSkillNames.join(", ")}. Restore them first.`,
    },
  });
}
