import { Hono } from "hono";

import { AppResource } from "@app/lib/resources/app_resource";
import {
  PostStateRequestBodySchema,
  type PostStateResponseBody,
} from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/state";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

// Mounted at /api/poke/workspaces/:wId/apps/:aId/state.
const app = new Hono();

app.post("/", validate("json", PostStateRequestBodySchema), async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId");
  if (!aId) {
    return apiError(c, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid path parameters.",
      },
    });
  }

  const appResource = await AppResource.fetchById(auth, aId);
  if (!appResource) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "app_not_found",
        message: "The app was not found.",
      },
    });
  }

  const body = c.req.valid("json");

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
  return c.json(responseBody);
});

export default app;
