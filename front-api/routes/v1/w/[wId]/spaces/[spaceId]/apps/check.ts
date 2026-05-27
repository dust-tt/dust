import { checkAppsDeployment } from "@app/lib/api/apps";
import type { AppsCheckResponseType } from "@dust-tt/client";
import { AppsCheckRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

/**
 * @ignoreswagger
 * Internal endpoint for CI. Undocumented.
 */
// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps/check.
const app = publicApiApp();

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", AppsCheckRequestSchema),
  async (ctx): HandlerResult<AppsCheckResponseType> => {
    const auth = ctx.get("auth");
    const { apps } = ctx.req.valid("json");

    const result = await checkAppsDeployment(auth, apps);

    return ctx.json({ apps: result });
  }
);

export default app;
