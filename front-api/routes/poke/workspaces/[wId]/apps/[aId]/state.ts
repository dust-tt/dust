import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const PostStateRequestBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

const ParamsSchema = z.object({
  aId: z.string(),
});

type PostStateResponseBody = {
  app: AppType;
};

// Mounted at /api/poke/workspaces/:wId/apps/:aId/state.
const app = pokeApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostStateRequestBodySchema),
  async (ctx): HandlerResult<PostStateResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");
    if (!aId) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid path parameters.",
        },
      });
    }

    const appResource = await AppResource.fetchById(auth, aId);
    if (!appResource) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "app_not_found",
          message: "The app was not found.",
        },
      });
    }

    const body = ctx.req.valid("json");

    const updateParams: {
      savedSpecification: string;
      savedConfig: string;
      savedRun?: string;
    } = {
      savedSpecification: body.specification,
      savedConfig: body.config,
    };

    if (body.run) {
      updateParams.savedRun = body.run;
    }

    await appResource.updateState(auth, updateParams);

    return ctx.json({ app: appResource.toJSON() });
  }
);

export default app;
