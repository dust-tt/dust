import { AppResource } from "@app/lib/resources/app_resource";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { Hono } from "hono";
import { z } from "zod";

const PostStateBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/state.
const app = new Hono();

app.post(
  "/",
  withSpace({ requireCanWrite: true }),
  validate("json", PostStateBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const aId = ctx.req.param("aId") ?? "";

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
