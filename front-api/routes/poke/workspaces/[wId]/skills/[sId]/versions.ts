import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";
import { pokeWorkspaceApp } from "@front-api/middleware/env";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";

export type PokeGetSkillVersions = {
  versions: SkillWithVersionType[];
};

// Mounted at /api/poke/workspaces/:wId/skills/:sId/versions.
const app = pokeWorkspaceApp();

app.get("/", async (ctx): HandlerResult<PokeGetSkillVersions> => {
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

  const versions = await skill.listVersions(auth);

  return ctx.json({
    versions: versions.map((v) => ({
      ...v.toJSON(auth),
      version: v.version,
    })),
  });
});

export default app;
