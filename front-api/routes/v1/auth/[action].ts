/* eslint-disable dust/enforce-client-types-in-public-api */
// Pass through to workOS, do not enforce return types.

import config from "@app/lib/api/config";
import { getWorkOS } from "@app/lib/api/workos/client";
import {
  decodeClientState,
  isAllowedCallbackUrl,
} from "@app/lib/api/workos/oauth_state";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const workosConfig = {
  name: "workos",
  authorizeUri: "api.workos.com/user_management/authorize",
  authenticateUri: "api.workos.com/user_management/authenticate",
  logoutUri: "api.workos.com/user_management/sessions/logout",
  clientId: config.getWorkOSClientId(),
  scopes: "openid profile email offline_access",
};

/**
 * @ignoreswagger
 */

const ActionParamSchema = z.object({
  action: z.enum(["authorize", "authenticate", "callback", "logout"]),
});

// Mounted at /api/v1/auth/:action. Unauthenticated OAuth proxy endpoints.
const app = unauthedApp();

app.all("/", validate("param", ActionParamSchema), async (ctx) => {
  const { action } = ctx.req.valid("param");

  switch (action) {
    case "authorize":
      return handleAuthorize(ctx);
    case "authenticate":
      return handleAuthenticate(ctx);
    case "callback":
      return handleCallback(ctx);
    case "logout":
      return handleLogout(ctx);
  }
});

async function handleAuthorize(ctx: Context) {
  const query = ctx.req.query();

  let workspaceId: string | undefined = undefined;
  if (
    typeof query.organization_id === "string" &&
    query.organization_id.startsWith("workspace-")
  ) {
    workspaceId = query.organization_id.split("workspace-")[1];
  }

  if (typeof query.workspaceId === "string") {
    workspaceId = query.workspaceId;
  }

  const workspace = workspaceId
    ? await WorkspaceResource.fetchById(workspaceId)
    : null;

  const options: Record<string, string | undefined> = {
    client_id: workosConfig.clientId,
    scope: workosConfig.scopes,
  };

  options.provider = "authkit";

  if (workspace) {
    const organizationId = workspace.workOSOrganizationId;
    if (!organizationId) {
      logger.error(
        `Workspace with sId ${workspaceId} does not have a WorkOS organization ID.`
      );
      return ctx.json(
        { error: "Workspace does not have a WorkOS organization ID" },
        400
      );
    }

    const connections = await getWorkOS().sso.listConnections({
      organizationId,
    });

    options.organizationId = organizationId;
    options.connectionId =
      connections.data.length > 0 ? connections.data[0]?.id : undefined;
  }

  const params = new URLSearchParams({
    ...options,
    response_type: `${query.response_type}`,
    redirect_uri: `${query.redirect_uri}`,
    code_challenge_method: `${query.code_challenge_method}`,
    code_challenge: `${query.code_challenge}`,
    state: JSON.stringify({
      provider: workosConfig.name,
      // Pass through client's state for OAuth proxy flows (e.g., Zendesk)
      client_state: isString(query.state) ? query.state : undefined,
    }),
  });

  const authorizeUrl = `https://${workosConfig.authorizeUri}?${params}`;
  return ctx.redirect(authorizeUrl);
}

async function handleAuthenticate(ctx: Context) {
  try {
    const body = await ctx.req.parseBody();

    // eslint-disable-next-line no-restricted-globals
    const response = await fetch(`https://${workosConfig.authenticateUri}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: ctx.req.header("origin") ?? "",
      },
      credentials: "include",
      body: new URLSearchParams({
        ...body,
        client_id: workosConfig.clientId,
      }).toString(),
    });
    const data = await response.json();
    return ctx.json(
      data as Record<string, unknown>,
      response.status as 200 | 400 | 401 | 403 | 404 | 500
    );
  } catch (error) {
    logger.error(
      { error: normalizeError(error) },
      "Error in authenticate proxy"
    );
    return ctx.json({ error: "Internal server error" }, 500);
  }
}

async function handleLogout(ctx: Context) {
  const query = ctx.req.query();
  const params = new URLSearchParams({
    ...query,
    client_id: workosConfig.clientId,
  }).toString();
  const logoutUrl = `https://${workosConfig.logoutUri}?${params}`;
  return ctx.redirect(logoutUrl);
}

/**
 * OAuth callback proxy for apps with dynamic redirect URIs.
 */
async function handleCallback(ctx: Context) {
  const query = ctx.req.query();
  const { code, state, error, error_description } = query;

  if (!isString(state)) {
    return ctx.json({ error: "Missing state parameter" }, 400);
  }

  const callbackUrl = decodeClientState(state);
  if (!callbackUrl) {
    return ctx.json({ error: "Invalid state parameter" }, 400);
  }

  // Validate the callback URL against allowed patterns
  if (!isAllowedCallbackUrl(callbackUrl)) {
    return ctx.json({ error: "Invalid callback URL" }, 400);
  }

  const redirectUrl = new URL(callbackUrl);

  // Forward error to callback if present
  if (isString(error)) {
    redirectUrl.searchParams.set("error", error);
    if (isString(error_description)) {
      redirectUrl.searchParams.set("error_description", error_description);
    }
    return ctx.redirect(redirectUrl.toString());
  }

  if (!isString(code)) {
    return ctx.json({ error: "Missing code parameter" }, 400);
  }

  redirectUrl.searchParams.set("code", code);
  return ctx.redirect(redirectUrl.toString());
}

export default app;
