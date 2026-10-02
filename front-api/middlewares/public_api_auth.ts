import {
  Authenticator,
  getAPIKey,
  getApiKeyNameFromHeaders,
  getSessionFromBearerToken,
} from "@app/lib/auth";
import { KeyResource } from "@app/lib/resources/key_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getClientIp } from "@app/lib/utils/request";
import type { APIErrorWithContentfulStatusCode } from "@app/types/error";
import { getGroupIdsFromHeaders, getRoleFromHeaders } from "@app/types/groups";
import { getUserEmailFromHeaders } from "@app/types/user";
import type { PublicApiCtx } from "@front-api/middlewares/ctx";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

import { apiError } from "./utils";

type HeaderRecord = Record<string, string | string[] | undefined>;

function readHeaders(ctx: Context): HeaderRecord {
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

function validateWorkspaceFromAuth(
  auth: Authenticator
): APIErrorWithContentfulStatusCode | null {
  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    };
  }
  if (!plan.limits.canUseProduct) {
    return {
      status_code: 403,
      api_error: {
        type: "workspace_can_use_product_required_error",
        message:
          "Your current plan does not allow API access. Please upgrade your plan.",
      },
    };
  }
  const maintenance = owner.metadata?.maintenance;
  if (maintenance) {
    if (maintenance === "relocation-done") {
      return {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: `The workspace was not found. [${maintenance}]`,
        },
      };
    }
    return {
      status_code: 503,
      api_error: {
        type: "service_unavailable",
        message: `Service is currently unavailable. [${maintenance}]`,
      },
    };
  }
  if (
    WorkspaceResource.isWorkspaceKillSwitchedForAllAPIs(
      owner.metadata?.killSwitched
    )
  ) {
    return {
      status_code: 503,
      api_error: {
        type: "service_unavailable",
        message:
          "Access to this workspace has been disabled for emergency maintenance.",
      },
    };
  }
  return null;
}

function applyClientIp(auth: Authenticator, headers: HeaderRecord): void {
  const ip = getClientIp({ headers });
  if (ip !== "internal") {
    auth.setClientIp(ip);
  }
}

/**
 * Authenticates a public-API request (Authorization header required:
 * sandbox token, OAuth bearer, or API key) and stashes the resolved
 * `Authenticator` on the Hono context under `auth`.
 */
/**
 * @cc [owner:avervaet,label:security;api] user-email-miss-fails-closed
 * When a system-key request names a user in `x-api-user-email` and no single active member
 * matches, the request MUST NOT keep the system key's default authority: with `X-Dust-Group-Ids`
 * it continues scoped to those groups with the `user` role, without them it is rejected with 401.
 */
export const publicApiAuth = createMiddleware<PublicApiCtx>(
  async (ctx, next) => {
    const wId = ctx.req.param("wId");
    if (!wId) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      });
    }

    const authHeader = ctx.req.header("authorization");
    if (!authHeader) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message:
            "The request does not have valid authentication credentials.",
        },
      });
    }

    const headers = readHeaders(ctx);

    // 1) OAuth bearer token (resolves to a workspace user session).
    const bearerRes = await getSessionFromBearerToken(authHeader);
    if (bearerRes.isErr()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: bearerRes.error,
          message:
            "The request does not have valid authentication credentials.",
        },
      });
    }
    const session = bearerRes.value;
    if (session?.authenticationMethod === "bearer") {
      const auth = await Authenticator.fromSession(session, wId);

      if (auth.user() === null) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "user_not_found",
            message:
              "The user does not have an active session or is not authenticated.",
          },
        });
      }
      if (!auth.isUser()) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message: "Only users of the workspace can access this content.",
          },
        });
      }
      const workspaceError = validateWorkspaceFromAuth(auth);
      if (workspaceError) {
        return apiError(ctx, workspaceError);
      }
      applyClientIp(auth, headers);
      ctx.set("auth", auth);
      await next();
      return;
    }

    // 2) API key.
    const keyRes = await getAPIKey(authHeader);
    if (keyRes.isErr()) {
      return apiError(ctx, keyRes.error);
    }
    const requestedRole = getRoleFromHeaders(headers);
    const requestedGroupIds = getGroupIdsFromHeaders(headers);

    let workspaceAuth = await Authenticator.fromKey(
      keyRes.value,
      wId,
      requestedGroupIds,
      requestedRole
    );

    const workspaceError = validateWorkspaceFromAuth(workspaceAuth);
    if (workspaceError) {
      return apiError(ctx, workspaceError);
    }

    if (!workspaceAuth.isUser()) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "workspace_auth_error",
          message: "Only users of the workspace can access this content.",
        },
      });
    }

    // x-api-user-email: system-key-only impersonation.
    const userEmailFromHeader = getUserEmailFromHeaders(headers);
    if (userEmailFromHeader) {
      const userAuth = await workspaceAuth.exchangeSystemKeyForUserAuthByEmail(
        workspaceAuth,
        {
          userEmail: userEmailFromHeader,
          requestedRole,
        }
      );
      if (userAuth) {
        workspaceAuth = userAuth;
      } else if (requestedGroupIds) {
        // No member to act as (e.g. an external user on a whitelisted Slack domain): keep the
        // requested group scope, without the system key's admin role.
        workspaceAuth = await Authenticator.fromKey(
          keyRes.value,
          wId,
          requestedGroupIds,
          "user"
        );
      } else {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "workspace_auth_error",
            message:
              "The requested user is not an active member of the workspace.",
          },
        });
      }
    }

    // x-dust-api-key-name: system-key-only usage attribution, see
    // `Authenticator.keyForUsageAttribution`. Must stay after the
    // x-api-user-email exchange above, which rebuilds the Authenticator without
    // carrying the attribution key over.
    const apiKeyNameFromHeader = getApiKeyNameFromHeaders(headers);
    const key = workspaceAuth.key();
    if (apiKeyNameFromHeader && key && key.isSystem) {
      const attributionKey = await KeyResource.fetchByName(workspaceAuth, {
        name: apiKeyNameFromHeader,
        onlyActive: true,
      });
      if (attributionKey && !attributionKey.isSystem) {
        workspaceAuth = workspaceAuth.withAttributionKey({
          id: attributionKey.id,
          name: attributionKey.name,
        });
      }
    }

    applyClientIp(workspaceAuth, headers);
    ctx.set("auth", workspaceAuth);
    await next();
  }
);
