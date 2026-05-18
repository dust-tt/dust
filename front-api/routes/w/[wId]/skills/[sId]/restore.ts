import { Hono } from "hono";

import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isString } from "@app/types/shared/utils/general";

export type RestoreSkillConfigurationResponseBody = {
  success: true;
};

// Mounted at /api/w/:wId/skills/:sId/restore.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId");

  if (!isString(sId)) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: "Invalid skill ID.",
        },
      },
      400
    );
  }

  const skillResource = await SkillResource.fetchById(auth, sId);

  if (!skillResource) {
    return c.json(
      {
        error: {
          type: "skill_not_found",
          message: "The skill you're trying to access was not found.",
        },
      },
      404
    );
  }

  if (!skillResource.canWrite(auth)) {
    return c.json(
      {
        error: {
          type: "app_auth_error",
          message: "Only editors can restore this skill.",
        },
      },
      403
    );
  }

  // Check for existing active skill with the same name.
  const existingSkill = await SkillResource.fetchActiveByName(
    auth,
    skillResource.name
  );
  if (existingSkill) {
    return c.json(
      {
        error: {
          type: "invalid_request_error",
          message: `A skill with the name "${skillResource.name}" already exists.`,
        },
      },
      400
    );
  }

  await skillResource.restore(auth);

  return c.json({ success: true });
});

export default app;
