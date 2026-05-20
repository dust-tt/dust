import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

export type RestoreSkillConfigurationResponseBody = {
  success: true;
};

// Mounted at /api/w/:wId/skills/:sId/restore.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");
  const sId = c.req.param("sId");

  if (!isString(sId)) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID.",
      },
    });
  }

  const skillResource = await SkillResource.fetchById(auth, sId);

  if (!skillResource) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  if (!skillResource.canWrite(auth)) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Only editors can restore this skill.",
      },
    });
  }

  // Check for existing active skill with the same name.
  const existingSkill = await SkillResource.fetchActiveByName(
    auth,
    skillResource.name
  );
  if (existingSkill) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `A skill with the name "${skillResource.name}" already exists.`,
      },
    });
  }

  await skillResource.restore(auth);

  return c.json({ success: true });
});

export default app;
