import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { APIErrorResponse } from "@app/types/error";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import type { Context, TypedResponse } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  sId: z.string(),
});

// Mounted at /api/w/:wId/skills/:sId/favorite.
const app = workspaceApp();

async function loadSkill(
  ctx: Context,
  sId: string
): Promise<
  { skill: SkillResource } | (Response & TypedResponse<APIErrorResponse>)
> {
  const auth = ctx.get("auth");

  const skill = await SkillResource.fetchById(auth, sId);
  if (!skill) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "skill_not_found",
        message: "The skill you're trying to access was not found.",
      },
    });
  }

  return { skill };
}

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");
    const loaded = await loadSkill(ctx, sId);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    const result = await skill.setFavorite(auth, true);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

/** @ignoreswagger */
app.delete(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { sId } = ctx.req.valid("param");
    const loaded = await loadSkill(ctx, sId);
    if (loaded instanceof Response) {
      return loaded;
    }
    const { skill } = loaded;

    const result = await skill.setFavorite(auth, false);
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
