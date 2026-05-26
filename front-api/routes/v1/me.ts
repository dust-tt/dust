import { getUserWithWorkspaces } from "@app/lib/api/user";
import { getSessionFromBearerToken } from "@app/lib/auth";
import { UserResource } from "@app/lib/resources/user_resource";
import type { MeResponseType } from "@dust-tt/client";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

/**
 * @ignoreswagger
 * WIP, undocumented.
 * TODO(EXT): Document this endpoint.
 */

// Mounted at /api/v1/me. Token-only authentication (bearer token required,
// no workspace context). Mirrors withTokenAuthentication from
// front/lib/api/auth_wrappers.ts.
const app = unauthedApp();

app.get("/", async (ctx): HandlerResult<MeResponseType> => {
  const authHeader = ctx.req.header("authorization");

  const bearerRes = await getSessionFromBearerToken(authHeader);
  if (bearerRes.isErr()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: bearerRes.error,
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

  const session = bearerRes.value;
  if (session?.authenticationMethod !== "bearer") {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

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
