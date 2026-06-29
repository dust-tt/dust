import {
  isSandboxExecTokenPayload,
  isSandboxFunctionInvocationTokenPayload,
  verifySandboxExecToken,
} from "@app/lib/api/sandbox/access_tokens";
import {
  Authenticator,
  getAuthTokenKind,
  getFeatureFlags,
} from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { SandboxCtx } from "@front-api/middlewares/ctx";
import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";

import { apiError } from "./utils";

type SandboxTokenKind = "action" | "function_invocation";
type SandboxAuthOptions = {
  tokenKind: SandboxTokenKind;
};

function readHeaders(ctx: Context): Record<string, string> {
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  return headers;
}

/**
 * Authenticates a sandbox callback request. Requires a sandbox token in the
 * Authorization header, resolves the sandbox `Authenticator`, enforces the
 * route token kind, and stashes both `auth` and the verified token
 * `sandboxClaims` on the context so handlers don't re-verify the token.
 *
 * Mirrors `withSandboxAuthentication` in `front/lib/api/auth_wrappers.ts`.
 */
export function sandboxAuth({
  tokenKind,
}: SandboxAuthOptions): MiddlewareHandler<SandboxCtx> {
  return createMiddleware<SandboxCtx>(async (ctx, next) => {
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

    const token = ctx.req.header("authorization")?.replace("Bearer ", "");
    if (!token) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message:
            "The request does not have valid authentication credentials.",
        },
      });
    }
    if (getAuthTokenKind(token) !== "sandbox_token") {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "This endpoint requires a sandbox token.",
        },
      });
    }

    const claims = await verifySandboxExecToken(token);
    if (!claims) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "invalid_sandbox_token_error",
          message: "The sandbox token is invalid or expired.",
        },
      });
    }
    if (tokenKind === "action" && !isSandboxExecTokenPayload(claims)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "This sandbox token cannot access sandbox actions.",
        },
      });
    }
    if (
      tokenKind === "function_invocation" &&
      !isSandboxFunctionInvocationTokenPayload(claims)
    ) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message:
            "This sandbox token cannot access sandbox function invocations.",
        },
      });
    }

    const authRes = await Authenticator.fromSandboxToken(claims, wId);
    if (authRes.isErr()) {
      return apiError(ctx, authRes.error);
    }
    const auth = authRes.value;

    if (tokenKind === "action") {
      const featureFlags = await getFeatureFlags(auth);
      if (!isComputerFeatureEnabled(featureFlags)) {
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "invalid_request_error",
            message: "Sandbox tools are not enabled for this workspace.",
          },
        });
      }
    }

    const ip = getClientIp({ headers: readHeaders(ctx) });
    if (ip !== "internal") {
      auth.setClientIp(ip);
    }

    ctx.set("auth", auth);
    ctx.set("sandboxClaims", claims);
    await next();
  });
}
