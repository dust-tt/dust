import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import { z } from "zod";

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/w/:wId/skills/:sId/restore.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    if (!isString(sId)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid skill ID.",
        },
      });
    }

    const skillResource = await SkillResource.fetchById(auth, sId);

    if (!skillResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill you're trying to access was not found.",
        },
      });
    }

    if (!skillResource.canWrite(auth)) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `A skill with the name "${skillResource.name}" already exists.`,
        },
      });
    }

    await skillResource.restore(auth);

    return ctx.json({ success: true });
  }
);

export default app;
