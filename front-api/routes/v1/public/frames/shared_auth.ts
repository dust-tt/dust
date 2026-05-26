import { getWorkOSSessionWithSetCookies } from "@app/lib/api/workos/user";
import { Authenticator, getSessionFromBearerToken } from "@app/lib/auth";
import { getClientIp } from "@app/lib/utils/request";
import type { Context } from "hono";
import { getCookie } from "hono/cookie";

/**
 * Resolves an optional authenticator for the current request.
 *
 * Mirrors `getAuthForSharedEndpointWorkspaceMembersOnly` from
 * `front/lib/api/auth_wrappers.ts` — tries bearer token first, then
 * cookie-based session. Returns `null` when the user is not authenticated
 * or is not a member of the workspace (shared frames can be accessed by
 * unauthenticated users too).
 */
export async function resolveOptionalAuth(
  ctx: Context,
  workspaceId: string
): Promise<Authenticator | null> {
  const bearerRes = await getSessionFromBearerToken(
    ctx.req.header("authorization")
  );
  // Invalid bearer token — treat as unauthenticated.
  if (bearerRes.isErr()) {
    return null;
  }

  let session = bearerRes.value;
  if (!session) {
    const result = await getWorkOSSessionWithSetCookies(
      getCookie(ctx, "workos_session")
    );
    for (const cookie of result.setCookies) {
      ctx.header("Set-Cookie", cookie, { append: true });
    }
    session = result.session ?? null;
  }

  if (!session) {
    return null;
  }

  const auth = await Authenticator.fromSession(session, workspaceId);
  if (!auth.isUser()) {
    return null;
  }

  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const ip = getClientIp({ headers });
  if (ip !== "internal") {
    auth.setClientIp(ip);
  }

  return auth;
}
