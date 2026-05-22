import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import type { AppType } from "@app/types/app";
import { APP_NAME_REGEXP } from "@app/types/app";
import { CoreAPI } from "@app/types/core/core_api";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { withSpace } from "@front-api/middleware/with_space";
import { z } from "zod";

import aId from "./[aId]";

export type GetAppsResponseBody = {
  apps: AppType[];
};

export type PostAppResponseBody = {
  app: AppType;
};

const PostAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps.
const app = workspaceApp();

// GET / — list apps in space.
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetAppsResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const apps = await AppResource.listBySpace(auth, space);
    return ctx.json({ apps: apps.map((a) => a.toJSON()) });
  }
);

// POST / — create app.
app.post(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  validate("json", PostAppBodySchema),
  async (ctx): HandlerResult<PostAppResponseBody> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");
    const owner = auth.getNonNullableWorkspace();

    if (!space.canWrite(auth) || !auth.isBuilder()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can create an app.",
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

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const p = await coreAPI.createProject();
    if (p.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Failed to create internal project for the app.",
          data_source_error: p.error,
        },
      });
    }

    const created = await AppResource.makeNew(
      {
        sId: generateRandomModelSId(),
        name,
        description: description || null,
        dustAPIProjectId: p.value.project.project_id.toString(),
        workspaceId: owner.id,
        visibility: "private",
      },
      space
    );
    return ctx.json({ app: created.toJSON() }, 201);
  }
);

app.route("/:aId", aId);

export default app;
