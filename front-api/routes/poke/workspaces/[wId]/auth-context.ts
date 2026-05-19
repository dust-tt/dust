import { Hono } from "hono";

import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { Authenticator } from "@app/lib/auth";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType, UserType } from "@app/types/user";

import { apiError } from "@front-api/middleware/utils";

export type GetPokeWorkspaceAuthContextResponseType = {
  user: UserType;
  workspace: LightWorkspaceType;
  subscription: SubscriptionType;
  isAdmin: true; // Superusers have admin privileges
  isBuilder: true; // Superusers have builder privileges
  isSuperUser: true;
};

const app = new Hono();

app.get("/", async (c) => {
  const session = c.get("pokeSession");
  const wId = c.req.param("wId")!;

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const workspace = auth.workspace();
  const subscription = auth.subscription();
  const userResource = auth.getNonNullableUser();

  // If workspace not found locally, lookup in other region.
  if (!workspace || !subscription) {
    const redirect = await getWorkspaceRegionRedirect(wId);

    if (redirect) {
      // Non-standard error envelope: includes a `redirect` field consumed by
      // the Poke UI to send the user to the workspace's home region.
      return c.json(
        {
          error: {
            type: "workspace_in_different_region" as const,
            message: "Workspace is located in a different region",
            redirect,
          },
        },
        400
      );
    }

    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Workspace not found.",
      },
    });
  }

  return c.json({
    user: userResource.toJSON(),
    workspace,
    subscription,
    isAdmin: true,
    isBuilder: true,
    isSuperUser: true,
  });
});

export default app;
