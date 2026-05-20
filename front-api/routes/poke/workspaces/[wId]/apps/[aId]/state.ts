import { AppResource } from "@app/lib/resources/app_resource";
import type { AppType } from "@app/types/app";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PostStateRequestBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

type PostStateResponseBody = {
  app: AppType;
};

// Mounted at /api/poke/workspaces/:wId/apps/:aId/state.
const app = new Hono();

app.post("/", validate("json", PostStateRequestBodySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId");
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

  const responseBody: PostStateResponseBody = { app: appResource.toJSON() };
  return ctx.json(responseBody);
});

export default app;
