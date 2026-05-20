import { SkillResource } from "@app/lib/resources/skill/skill_resource";

import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import suggestions from "./suggestions";

declare module "hono" {
  interface ContextVariableMap {
    skill: SkillResource;
  }
}

// Mounted under /api/w/:wId/assistant/skills/:sId. Resolves :sId into a
// SkillResource and enforces canWrite; everything below this directory
// inherits the `skill` context variable.
const app = new Hono();

app.use("*", async (c, next) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId") ?? "";

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill configuration was not found.",
      },
    });
  }

  if (!skill.canWrite(auth)) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the skill or workspace admins can view suggestions.",
      },
    });
  }

  c.set("skill", skill);
  await next();
});

app.route("/suggestions", suggestions);

export default app;
