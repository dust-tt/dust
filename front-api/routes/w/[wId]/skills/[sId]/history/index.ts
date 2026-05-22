import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { GetSkillHistoryQuerySchema } from "@app/types/api/internal/skill";
import type { SkillWithVersionType } from "@app/types/assistant/skill_configuration";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { fromError } from "zod-validation-error";

export type GetSkillHistoryResponseBody = {
  history: SkillWithVersionType[];
};

// Mounted at /api/w/:wId/skills/:sId/history.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetSkillHistoryResponseBody> => {
  const auth = ctx.get("auth");
  const sId = ctx.req.param("sId");

  if (!isString(sId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid skill ID provided.",
      },
    });
  }

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
});

export default app;
