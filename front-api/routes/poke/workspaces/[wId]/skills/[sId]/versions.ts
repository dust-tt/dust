import { Hono } from "hono";

import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";

import { apiError } from "@front-api/middleware/utils";

export type PokeGetSkillVersions = {
  versions: SkillWithVersionType[];
};

// Mounted at /api/poke/workspaces/:wId/skills/:sId/versions.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId");
  if (!sId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "Skill not found.",
      },
    });
  }

  const versions = await skill.listVersions(auth);

  const body: PokeGetSkillVersions = {
    versions: versions.map((v) => ({
      ...v.toJSON(auth),
      version: v.version,
    })),
  };
  return c.json(body);
});

export default app;
