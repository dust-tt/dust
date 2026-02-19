import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
import type { AcademyIdentifier } from "@app/types/academy";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve an AcademyIdentifier from the current request.
 *  - If the user has a session, resolve their userId.
 *  - Otherwise, read the X-Academy-Browser-Id header and validate as UUID.
 *  - Returns null if neither is available.
 */
export async function getAcademyIdentifier(
  headers: Record<string, string | string[] | undefined>,
  session: SessionWithUser | null
): Promise<AcademyIdentifier | null> {
  if (session) {
    const user = await fetchUserFromSession(session);
    if (user) {
      return { userId: user.id };
    }
  }

  const rawBrowserId = headers["x-academy-browser-id"];
  if (typeof rawBrowserId === "string" && UUID_RE.test(rawBrowserId)) {
    return { browserId: rawBrowserId };
  }

  return null;
}
