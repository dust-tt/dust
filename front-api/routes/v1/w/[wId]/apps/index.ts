import { AppResource } from "@app/lib/resources/app_resource";
import type { GetAppsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { withSpace } from "@front-api/middlewares/with_space";

import runs from "./[aId]/runs";

// Mounted at /api/v1/w/:wId/apps; publicApiAuth is applied by the parent v1
// workspace sub-app. These are legacy endpoints that omit the space from the
// path: `withSpace` falls back to the workspace global space. The run
// endpoints delegate to the canonical space-scoped handlers (see ./[aId]/runs).
const app = publicApiApp();

app.route("/:aId/runs", runs);

/**
 * @ignoreswagger
 * Legacy endpoint.
 */
app.get(
  "/",
  withSpace({ requireCanReadOrAdministrate: true }),
  async (ctx): HandlerResult<GetAppsResponseType> => {
    const auth = ctx.get("auth");
    const space = ctx.get("space");

    const apps = await AppResource.listBySpace(auth, space);

    return ctx.json({
      apps: apps.filter((a) => a.canRead(auth)).map((a) => a.toJSON()),
    });
  }
);

export default app;
