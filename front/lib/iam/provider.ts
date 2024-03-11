import type { Session } from "@auth0/nextjs-auth0";

// This maps to the Auth0 user.
export interface ExternalUser {
  email: string;
  email_verified: boolean;
  name: string;
  nickname: string;
  sub: string;

  // Google-specific fields.
  family_name?: string;
  given_name?: string;

  // Always optional.
  picture?: string;
}

function isExternalUser(user: Session["user"]): user is ExternalUser {
  return (
    typeof user === "object" &&
    "email" in user &&
    "email_verified" in user &&
    "name" in user &&
    "nickname" in user &&
    "sub" in user
  );
}

function isAuth0Session(session: unknown): session is Session {
  return typeof session === "object" && session !== null && "user" in session;
}

// We only expose generic types to ease phasing out.

export type SessionWithUser = Session & { user: ExternalUser };

export function isValidSession(
  session: Session | null
): session is SessionWithUser {
  return isAuth0Session(session) && isExternalUser(session.user);
}
