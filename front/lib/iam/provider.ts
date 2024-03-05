import type { UserProviderType } from "@dust-tt/types";

interface LegacyProvider {
  provider: UserProviderType;
  id: number | string;
}

interface LegacyExternalUser {
  name: string;
  email: string;
  image?: string;
  username?: string;
  email_verified?: boolean;
}

interface LegacySession {
  provider: LegacyProvider;
  user: LegacyExternalUser;
}

function isLegacyExternalUser(user: unknown): user is LegacyExternalUser {
  return (
    typeof user === "object" &&
    user !== null &&
    "email" in user &&
    "name" in user
  );
}

function isLegacyProvider(provider: unknown): provider is LegacyProvider {
  return (
    typeof provider === "object" &&
    provider !== null &&
    "provider" in provider &&
    "id" in provider
  );
}

export function isLegacySession(session: unknown): session is LegacySession {
  return (
    typeof session === "object" &&
    session !== null &&
    "provider" in session &&
    isLegacyProvider(session.provider) &&
    "user" in session &&
    isLegacyExternalUser(session.user)
  );
}

// We only expose generic types to ease phasing out.

export type Session = LegacySession;

export function isValidSession(session: unknown): session is Session {
  return isLegacySession(session);
}
