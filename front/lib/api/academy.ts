import { getSession } from "@app/lib/auth";
import { fetchUserFromSession } from "@app/lib/iam/users";
import type { UserResource } from "@app/lib/resources/user_resource";
import type { IncomingMessage, ServerResponse } from "http";

export async function getAcademyUser(
  req: IncomingMessage & { cookies: Partial<{ [key: string]: string }> },
  res: ServerResponse
): Promise<UserResource | null> {
  const session = await getSession(req, res);
  if (!session) {
    return null;
  }

  // Resolve the UserResource from the session.
  return fetchUserFromSession(session);
}
