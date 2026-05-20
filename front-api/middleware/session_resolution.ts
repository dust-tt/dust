import { getWorkOSSessionWithSetCookies } from "@app/lib/api/workos/user";
import { getSessionFromBearerToken } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { apiError, parseCookieHeader } from "@front-api/middleware/utils";
import type { Context } from "hono";

/**
 * Resolves the session for a Hono request by trying the bearer token first,
 * then falling back to the `workos_session` cookie. Returns the resolved
 * session on success, or a `Response` (to be returned by the caller) when
 * authentication fails.
 *
 * Mirrors the bearer-or-cookie chain in `front/logger/withlogging.ts`.
 */
export async function resolveSession(
  c: Context
): Promise<Response | SessionWithUser> {
  const bearerRes = await getSessionFromBearerToken(
    c.req.header("authorization")
  );
  if (bearerRes.isErr()) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: bearerRes.error,
        message: "The request does not have valid authentication credentials.",
      },
    });
  }

  let session: SessionWithUser | null | undefined = bearerRes.value;
  if (!session) {
    const cookies = parseCookieHeader(c.req.header("cookie"));
    const result = await getWorkOSSessionWithSetCookies(
      cookies["workos_session"]
    );
    for (const cookie of result.setCookies) {
      c.header("Set-Cookie", cookie, { append: true });
    }
    session = result.session ?? null;
  }

  if (!session) {
    return apiError(c, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message:
          "The user does not have an active session or is not authenticated.",
      },
    });
  }

  return session;
}
