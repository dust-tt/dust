import { Hono } from "hono";
import { z } from "zod";

import { AppResource } from "@app/lib/resources/app_resource";

import { spaceResource } from "@front-api/middleware/space_resource";
import { validate } from "@front-api/middleware/validator";

const PostStateBodySchema = z.object({
  specification: z.string(),
  config: z.string(),
  run: z.string().optional(),
});

// Mounted under /api/w/:wId/spaces/:spaceId/apps/:aId/state.
const app = new Hono();

app.post(
  "/",
  spaceResource({ requireCanWrite: true }),
  validate("json", PostStateBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const space = c.get("space");
    const aId = c.req.param("aId") ?? "";

    const found = await AppResource.fetchById(auth, aId);
    if (!found || found.space.sId !== space.sId) {
      return c.json(
        {
          error: { type: "app_not_found", message: "The app was not found." },
        },
        404
      );
    }
    if (!found.canWrite(auth)) {
      return c.json(
        {
          error: {
            type: "app_auth_error",
            message:
              "Modifying an app requires write access to the app's space.",
          },
        },
        403
      );
    }
    const { specification, config: appConfig, run } = c.req.valid("json");
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
    return c.json({ app: found.toJSON() });
  }
);

export default app;
