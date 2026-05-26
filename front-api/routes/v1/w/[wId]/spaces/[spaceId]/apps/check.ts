import { checkAppsDeployment } from "@app/lib/api/apps";
import type { AppsCheckResponseType } from "@dust-tt/client";
import { AppsCheckRequestSchema } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { withSpace } from "@front-api/middlewares/with_space";

/**
 * @ignoreswagger
 * Internal endpoint for CI. Undocumented.
 */
const app = publicApiApp();

app.post(
  "/",
  withSpace({ requireCanRead: true }),
  validate("json", AppsCheckRequestSchema),
  async (ctx): HandlerResult<AppsCheckResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    if (!space.canRead(auth)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "The space you requested was not found.",
        },
      });
    }

    const body = ctx.req.valid("json");
    const apps = await checkAppsDeployment(auth, body.apps);

    return ctx.json({ apps });
  }
);

export default app;
