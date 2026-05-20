import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { SpaceType } from "@app/types/space";
import type { UserType } from "@app/types/user";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type PokeGetSkillDetails = {
  skill: SkillType;
  editedByUser: UserType | null;
  spaces: SpaceType[];
};

// Mounted at /api/poke/workspaces/:wId/skills/:sId/details.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<PokeGetSkillDetails> => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");
  if (!sId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "Skill not found.",
      },
    });
  }

  const serializedSkill = skill.toJSON(auth);
  const editedByUser = await skill.fetchEditedByUser(auth);
  const spaces = await SpaceResource.fetchByIds(
    auth,
    serializedSkill.requestedSpaceIds
  );

  return ctx.json({
    skill: serializedSkill,
    editedByUser: editedByUser ? editedByUser.toJSON() : null,
    spaces: spaces.map((s) => s.toJSON()),
  });
});

export default app;
