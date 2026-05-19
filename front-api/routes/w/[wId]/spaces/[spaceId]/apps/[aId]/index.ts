import { Hono } from "hono";

import { apiError } from "@front-api/middleware/utils";
import { z } from "zod";

import { softDeleteApp } from "@app/lib/api/apps";
import { AppResource } from "@app/lib/resources/app_resource";
import { APP_NAME_REGEXP } from "@app/types/app";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

import datasets from "./datasets";
import runs from "./runs";
import state from "./state";

const PatchAppBodySchema = z.object({
  name: z.string(),
  description: z.string(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId.
const app = new Hono();

// GET / — read app.
app.get("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";

  const found = await AppResource.fetchById(auth, aId);
  if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
    return apiError(c, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }
  return c.json({ app: found.toJSON() });
});

// POST / — update app settings.
app.post(
  "/",
  spaceResource({ requireCanRead: true }),
  validate("json", PatchAppBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
      return apiError(c, {
        status_code: 404,
        api_error: { type: "app_not_found", message: "The app was not found." },
      });
    }
    if (!found.canWrite(auth)) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Modifying an app requires write access to the app's space.",
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
    await found.updateSettings(auth, { name, description });
    return c.json({ app: found.toJSON() });
  }
);

// DELETE / — soft delete app.
app.delete("/", spaceResource({ requireCanRead: true }), async (c) => {
  const auth = c.get("auth");
  const space = c.get("space");
  const aId = c.req.param("aId") ?? "";

  const found = await AppResource.fetchById(auth, aId);
  if (!found || found.space.sId !== space.sId || !found.canRead(auth)) {
    return apiError(c, {
      status_code: 404,
      api_error: { type: "app_not_found", message: "The app was not found." },
    });
  }
  if (!found.canWrite(auth)) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message: "Deleting an app requires write access to the app's space.",
      },
    });
  }
  const deleteRes = await softDeleteApp(auth, found);
  if (deleteRes.isErr()) {
    return apiError(c, {
      status_code: 409,
      api_error: {
        type: "invalid_request_error",
        message: deleteRes.error.message,
      },
    });
  }
  return c.body(null, 204);
});

app.route("/state", state);
app.route("/runs", runs);
app.route("/datasets", datasets);

export default app;
