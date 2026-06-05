import type { PokeGetSkillDetails } from "@app/lib/api/poke/skills";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/skills/:sId/details.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PokeGetSkillDetails> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

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
  }
);

export default app;
