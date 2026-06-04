import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

export type PostStateResponseBody = {
  app: AppType;
};

const PostStateBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/state.
const app = workspaceApp();

app.post(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanWrite: true }),
  validate("json", PostStateBodySchema),
  async (ctx): HandlerResult<PostStateResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId } = ctx.req.valid("param");

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "app_not_found", message: "The app was not found." },
      });
    }
    if (!found.canWrite(auth)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Modifying an app requires write access to the app's space.",
        },
      });
    }
    const { specification, config: appConfig, run } = ctx.req.valid("json");
    const updateParams: {
      savedSpecification: string;
      savedConfig: string;
      savedRun?: string;
    } = {
      savedSpecification: specification,
      savedConfig: appConfig,
    };
    if (run) {
      updateParams.savedRun = run;
    }
    await found.updateState(auth, updateParams);
    return ctx.json({ app: found.toJSON() });
  }
);

export default app;
