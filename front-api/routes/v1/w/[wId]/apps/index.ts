/* eslint-disable dust/enforce-client-types-in-public-api */
import { AppResource } from "@app/lib/resources/app_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { GetAppsResponseType } from "@dust-tt/client";
import { publicApiApp } from "@front-api/middlewares/ctx";
import { publicApiAuth } from "@front-api/middlewares/public_api_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

import runs from "./[aId]/runs";

// Mounted at /api/v1/w/:wId/apps. This sub-tree is mounted before
// `publicWorkspaceApp` in `app.ts` so the run-app POST can use the
// system-key-bypass auth variant. Each route applies auth explicitly.
//
// This is a legacy endpoint: the space is not in the URL, so the global
// workspace space is assumed (mirroring `withResourceFetchingFromRoute`).
const app = publicApiApp();

app.route("/:aId/runs", runs);

/**
 * @ignoreswagger
 * Legacy endpoint.
 */
app.get("/", publicApiAuth, async (ctx): HandlerResult<GetAppsResponseType> => {
  const auth = ctx.get("auth");

  const space = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
  if (!space.canReadOrAdministrate(auth)) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "space_not_found",
        message: "The space you requested was not found.",
      },
    });
  }

  const apps = await AppResource.listBySpace(auth, space);

  return ctx.json({
    apps: apps.filter((a) => a.canRead(auth)).map((a) => a.toJSON()),
  });
});

export default app;
