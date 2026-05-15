import type { Context, MiddlewareHandler } from "hono";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  Authenticator,
  getSession,
  getSessionFromBearerToken,
} from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";

declare module "hono" {
  interface ContextVariableMap {
    auth: Authenticator;
  }
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) {
    return {};
  }
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    cookies[trimmed.slice(0, eq)] = decodeURIComponent(trimmed.slice(eq + 1));
  }
  return cookies;
}

// Bridge a Hono Context to the minimal NextApiRequest/NextApiResponse shape
// required by the existing auth helpers (which read req.cookies/req.headers
// and call res.setHeader to refresh the workos_session cookie).
function buildNextLikeReqRes(c: Context): {
  req: NextApiRequest;
  res: NextApiResponse;
  setCookies: string[];
} {
  const headers: Record<string, string> = {};
  c.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const cookies = parseCookieHeader(headers.cookie);
  const setCookies: string[] = [];

  const req = {
    cookies,
    headers,
    query: {},
    socket: { remoteAddress: undefined },
    method: c.req.method,
    url: c.req.url,
  };

  const res = {
    setHeader: (name: string, value: string | string[]) => {
      if (name.toLowerCase() === "set-cookie") {
        if (Array.isArray(value)) {
          setCookies.push(...value);
        } else {
          setCookies.push(value);
        }
      }
    },
  };

  return {
    req: req as unknown as NextApiRequest,
    res: res as unknown as NextApiResponse,
    setCookies,
  };
}

/**
 * Authenticates a workspace-scoped request and stores the resolved
 * `Authenticator` on the Hono context under the `auth` variable.
 *
 * Mirrors the behavior of `withSessionAuthenticationForWorkspace` in
 * `front/lib/api/auth_wrappers.ts`. Apply to any route under
 * `/api/w/:wId/...`.
 */
export const workspaceAuth: MiddlewareHandler = async (c, next) => {
  const wId = c.req.param("wId");
  if (!wId) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
    );
  }

  const { req, res, setCookies } = buildNextLikeReqRes(c);

  // Try bearer token first, then fall back to cookie-based session.
  // Mirrors withLogging in front/logger/withlogging.ts.
  const bearerRes = await getSessionFromBearerToken(
    c.req.header("authorization")
  );
  if (bearerRes.isErr()) {
    return c.json(
      {
        error: {
          type: bearerRes.error,
          message:
            "The request does not have valid authentication credentials.",
        },
      },
      401
    );
  }
  const session = bearerRes.value ?? (await getSession(req, res));

  for (const cookie of setCookies) {
    c.header("Set-Cookie", cookie, { append: true });
  }

  if (!session) {
    return c.json(
      {
        error: {
          type: "not_authenticated",
          message:
            "The user does not have an active session or is not authenticated.",
        },
      },
      401
    );
  }

  const auth = await Authenticator.fromSession(session, wId);

  const ip = getClientIp(req);
  if (ip !== "internal") {
    auth.setClientIp(ip);
  }

  const owner = auth.workspace();
  const plan = auth.plan();
  if (!owner || !plan) {
    return c.json(
      {
        error: {
          type: "workspace_not_found",
          message: "The workspace was not found.",
        },
      },
      404
    );
  }

  if (!auth.isUser()) {
    return c.json(
      {
        error: {
          type: "workspace_auth_error",
          message: "Only users of the workspace can access this content.",
        },
      },
      401
    );
  }

  c.set("auth", auth);
  await next();
};
