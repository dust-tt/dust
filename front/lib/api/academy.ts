import type { IncomingMessage, ServerResponse } from "http";

import { getSession } from "@app/lib/auth";
import { fetchUserFromSession } from "@app/lib/iam/users";
import type { UserResource } from "@app/lib/resources/user_resource";

interface AcademyAccessResult {
  hasAccess: true;
  user: UserResource | null;
}

export async function getAcademyAccessAndUser(
  req: IncomingMessage & { cookies: Partial<{ [key: string]: string }> },
  res: ServerResponse
): Promise<AcademyAccessResult> {
  const session = await getSession(req, res);
  if (!session) {
    return { hasAccess: true, user: null };
  }

  // Resolve the UserResource from the session.
  const userResource = await fetchUserFromSession(session);

  return { hasAccess: true, user: userResource };
}
