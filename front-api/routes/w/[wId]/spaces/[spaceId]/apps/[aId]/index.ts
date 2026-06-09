import type { GetOrPostAppResponseBody } from "@app/lib/api/apps";
import { softDeleteApp } from "@app/lib/api/apps";
import { AppResource } from "@app/lib/resources/app_resource";
import { APP_NAME_REGEXP } from "@app/types/app";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";
import { z } from "zod";

import datasets from "./datasets";
import runs from "./runs";
import state from "./state";

const PatchAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});

const ParamsSchema = z.object({
  aId: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId.
const app = workspaceApp();

// GET / — read app.
/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  async (ctx): HandlerResult<GetOrPostAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId } = ctx.req.valid("param");

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "app_not_found",
          message: "The app was not found.",
        },
      });
    }
    return ctx.json({ app: found.toJSON() });
  }
);

// POST / — update app settings.
app.post(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  validate("json", PatchAppBodySchema),
  async (ctx): HandlerResult<GetOrPostAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId } = ctx.req.valid("param");

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
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
    const { name, description } = ctx.req.valid("json");
    if (!APP_NAME_REGEXP.test(name)) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message:
            "The app name is invalid, expects a string with a length of 1-64 characters, containing only alphanumeric characters, underscores, and dashes.",
        },
      });
    }
    await found.updateSettings(auth, { name, description });
    return ctx.json({ app: found.toJSON() });
  }
);

// DELETE / — soft delete app.
app.delete(
  "/",
  validate("param", ParamsSchema),
  withSpace({ requireCanRead: true }),
  async (ctx) => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const { aId } = ctx.req.valid("param");

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
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
          message: "Deleting an app requires write access to the app's space.",
        },
      });
    }
    const deleteRes = await softDeleteApp(auth, found);
    if (deleteRes.isErr()) {
      return apiError(ctx, {
        status_code: 409,
        api_error: {
          type: "invalid_request_error",
          message: deleteRes.error.message,
        },
      });
    }
    return ctx.body(null, 204);
  }
);

app.route("/state", state);
app.route("/runs", runs);
app.route("/datasets", datasets);

export default app;
