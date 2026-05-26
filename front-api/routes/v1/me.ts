import { getUserWithWorkspaces } from "@app/lib/api/user";
import { UserResource } from "@app/lib/resources/user_resource";
import type { MeResponseType } from "@dust-tt/client";
import { sessionApp } from "@front-api/middlewares/ctx";
import { tokenAuth } from "@front-api/middlewares/token_auth";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";

/**
 * @ignoreswagger
 * WIP, undocumented.
 * TODO(EXT): Document this endpoint.
 */

// Mounted at /api/v1/me. Token-only authentication (bearer token required,
// no workspace context).
const app = sessionApp();

app.use(tokenAuth);

app.get("/", async (ctx): HandlerResult<MeResponseType> => {
  const session = ctx.get("session");

  const userResource = await UserResource.fetchByWorkOSUserId(
    session.user.workOSUserId
  );
  if (!userResource) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "user_not_found",
        message: "The user is not registered.",
      },
    });
  }

  const isFromExtension = ctx.req.header("x-request-origin") === "extension";
  const user = await getUserWithWorkspaces(userResource, isFromExtension);

  // Set selectedWorkspace from the organization in the bearer token.
  if (session.organizationId) {
    const workspace = user.workspaces.find(
      (w) => w.workOSOrganizationId === session.organizationId
    );
    user.selectedWorkspace = workspace?.sId;
  }

  return ctx.json({ user });
});

export default app;
