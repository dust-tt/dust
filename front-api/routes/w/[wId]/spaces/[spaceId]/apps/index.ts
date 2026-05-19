import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import config from "@app/lib/api/config";
import { AppResource } from "@app/lib/resources/app_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import logger from "@app/logger/logger";
import { APP_NAME_REGEXP } from "@app/types/app";
import { CoreAPI } from "@app/types/core/core_api";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import aId from "./[aId]";

const PostAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps.
const app = new Hono();

// GET / — list apps in space.
app.get(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const apps = await AppResource.listBySpace(auth, space);
    return c.json({ apps: apps.map((a) => a.toJSON()) });
  }
);

// POST / — create app.
app.post(
  "/",
  spaceResource({ requireCanReadOrAdministrate: true }),
  validate("json", PostAppBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const owner = auth.getNonNullableWorkspace();

    if (!space.canWrite(auth) || !auth.isBuilder()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can create an app.",
        },
      });
    }

    const { name, description } = c.req.valid("json");
    if (!APP_NAME_REGEXP.test(name)) {
      return apiError(c, {
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
      return apiError(c, {
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
    return c.json({ app: created.toJSON() }, 201);
  }
);

app.route("/:aId", aId);

export default app;
