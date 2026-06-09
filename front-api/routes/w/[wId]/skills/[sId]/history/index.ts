import type { GetSkillHistoryResponseBody } from "@app/lib/api/assistant/skills/history";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { GetSkillHistoryQuerySchema } from "@app/types/api/internal/skill";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";
import { fromError } from "zod-validation-error";

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/w/:wId/skills/:sId/history.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetSkillHistoryResponseBody> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");

    // Check that user has access to this skill.
    const skill = await SkillResource.fetchById(auth, sId);

    if (!skill || !skill.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "skill_not_found",
          message: "The skill you're trying to access was not found.",
        },
      });
    }

    const rawLimit = ctx.req.query("limit");
    const queryValidation = GetSkillHistoryQuerySchema.safeParse({
      limit: typeof rawLimit === "string" ? parseInt(rawLimit, 10) : undefined,
    });
    if (!queryValidation.success) {
      const pathError = fromError(queryValidation.error).toString();
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid query parameters: ${pathError}`,
        },
      });
    }

    const { limit } = queryValidation.data;

    let skillVersionResources = await skill.listVersions(auth);

    if (limit) {
      skillVersionResources = skillVersionResources.slice(0, limit);
    }

    const skillVersions = skillVersionResources.map((resource) => {
      const serializedSkill = resource.toJSON(auth);

      return {
        ...serializedSkill,
        instructionsHtml:
          serializedSkill.instructionsHtml ??
          (serializedSkill.instructions
            ? convertMarkdownToBlockHtml(serializedSkill.instructions)
            : null),
        version: resource.version,
      };
    });

    return ctx.json({ history: skillVersions });
  }
);

export default app;
