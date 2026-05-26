import { verifySandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import {
  Authenticator,
  getAPIKey,
  getApiKeyNameFromHeaders,
  getSessionFromBearerToken,
  isSandboxTokenPrefix,
} from "@app/lib/auth";
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
 * `Authenticator` on the Hono context under `auth`. Mirrors
 * `withPublicAPIAuthentication` in `front/lib/api/auth_wrappers.ts`.
 *
 * When `allowSystemKeyBypassBuilderCheck` is true, system keys bypass the
 * `isUser()` check even if their role is downgraded via the X-Dust-Role
 * header (the key must still belong to the target workspace). Mirrors the
 * option of the same name on `withPublicAPIAuthentication` — used by
 * `run_dust_app`.
 */
function createPublicApiAuth({
  allowSystemKeyBypassBuilderCheck = false,
}: {
  allowSystemKeyBypassBuilderCheck?: boolean;
} = {}) {
  return createMiddleware<PublicApiCtx>(async (ctx, next) => {
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

    // 1) Sandbox token.
    const token = authHeader.replace("Bearer ", "");
    if (token && isSandboxTokenPrefix(token)) {
      const payload = await verifySandboxExecToken(token);
      if (!payload) {
        return apiError(ctx, {
          status_code: 401,
          api_error: {
            type: "invalid_sandbox_token_error",
            message: "The sandbox token is invalid or expired.",
          },
        });
      }
      const authRes = await Authenticator.fromSandboxToken(payload, wId);
      if (authRes.isErr()) {
        return apiError(ctx, authRes.error);
      }
      const auth = authRes.value;
      applyClientIp(auth, headers);
      ctx.set("auth", auth);
      await next();
      return;
    }

    // 2) OAuth bearer token (resolves to a workspace user session).
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

    // 3) API key.
    const keyRes = await getAPIKey(authHeader);
    if (keyRes.isErr()) {
      return apiError(ctx, keyRes.error);
    }

    const keyAndWorkspaceAuth = await Authenticator.fromKey(
      keyRes.value,
      wId,
      getGroupIdsFromHeaders(headers),
      getRoleFromHeaders(headers)
    );
    let { workspaceAuth } = keyAndWorkspaceAuth;

    const workspaceError = validateWorkspaceFromAuth(workspaceAuth);
    if (workspaceError) {
      return apiError(ctx, workspaceError);
    }

    // Authenticator created from a key carries the role assigned at key
    // creation. System keys can bypass this check when
    // allowSystemKeyBypassBuilderCheck is set (key must belong to workspace).
    const owner = workspaceAuth.getNonNullableWorkspace();
    const isSystemKeyAllowed =
      allowSystemKeyBypassBuilderCheck &&
      workspaceAuth.isSystemKey() &&
      keyRes.value.workspaceId === owner.id;
    if (!workspaceAuth.isUser() && !isSystemKeyAllowed) {
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
      workspaceAuth =
        (await workspaceAuth.exchangeSystemKeyForUserAuthByEmail(
          workspaceAuth,
          {
            userEmail: userEmailFromHeader,
          }
        )) ?? workspaceAuth;
    }

    // x-api-key-name: system-key-only key name override (for analytics).
    const apiKeyNameFromHeader = getApiKeyNameFromHeaders(headers);
    const key = workspaceAuth.key();
    if (apiKeyNameFromHeader && key && key.isSystem) {
      workspaceAuth = workspaceAuth.exchangeKey({
        id: key.id,
        name: apiKeyNameFromHeader,
        isSystem: key.isSystem,
        role: key.role,
        monthlyCapMicroUsd: key.monthlyCapMicroUsd,
      });
    }

    applyClientIp(workspaceAuth, headers);
    ctx.set("auth", workspaceAuth);
    await next();
  });
}

export const publicApiAuth = createPublicApiAuth();

// Variant used by the run-app POST endpoint: system keys with a downgraded
// role (via X-Dust-Role) are still trusted.
export const publicApiAuthAllowSystemKeyBypassBuilderCheck =
  createPublicApiAuth({ allowSystemKeyBypassBuilderCheck: true });
