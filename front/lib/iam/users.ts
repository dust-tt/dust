import type { Session } from "@auth0/nextjs-auth0";
import type { UserProviderType } from "@dust-tt/types";
import { sanitizeString } from "@dust-tt/types";

import type { ExternalUser, SessionWithUser } from "@app/lib/iam/provider";
import { User } from "@app/lib/models/user";
import { generateLegacyModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { ServerSideTracking } from "@app/lib/tracking/server";
import { guessFirstAndLastNameFromFullName } from "@app/lib/user";

interface LegacyProviderInfo {
  provider: UserProviderType;
  providerId: number | string;
}

async function fetchUserWithLegacyProvider(
  { provider, providerId }: LegacyProviderInfo,
  sub: string
) {
  const user = await UserResource.fetchByProvider(
    provider,
    providerId.toString()
  );

  // If a legacy user is found, attach the Auth0 user ID (sub) to the existing user account.
  if (user) {
    await user.updateAuth0Sub(sub);
  }

  return user;
}

async function fetchUserWithAuth0Sub(sub: string) {
  const userWithAuth0 = await UserResource.fetchByAuth0Sub(sub);

  return userWithAuth0;
}

function mapAuth0ProviderToLegacy(session: Session): LegacyProviderInfo | null {
  const { user } = session;

  const [rawProvider, providerId] = user.sub.split("|");
  switch (rawProvider) {
    case "google-oauth2":
      return { provider: "google", providerId };

    case "github":
      return { provider: "github", providerId };

    default:
      return { provider: rawProvider, providerId };
  }
}

export async function fetchUserFromSession(session: SessionWithUser) {
  const { sub } = session.user;

  const userWithAuth0 = await fetchUserWithAuth0Sub(sub);
  if (userWithAuth0) {
    return userWithAuth0;
  }

  const legacyProviderInfo = mapAuth0ProviderToLegacy(session);
  if (!legacyProviderInfo) {
    return null;
  }

  return fetchUserWithLegacyProvider(legacyProviderInfo, sub);
}

export async function maybeUpdateFromExternalUser(
  user: UserResource,
  externalUser: ExternalUser
) {
  if (externalUser.picture && externalUser.picture !== user.imageUrl) {
    void User.update(
      {
        imageUrl: externalUser.picture,
      },
      {
        where: {
          id: user.id,
        },
      }
    );
  }
}

export async function createOrUpdateUser(
  session: SessionWithUser
): Promise<{ user: UserResource; created: boolean }> {
  const { user: externalUser } = session;

  const user = await fetchUserFromSession(session);

  if (user) {
    const updateArgs: { [key: string]: string } = {};
    // We only update the user's email if the email is verified.
    if (externalUser.email_verified) {
      updateArgs.email = externalUser.email;
    }

    // Update the user object from the updated session information.
    updateArgs.username = externalUser.nickname;

    if (!user.firstName && !user.lastName) {
      if (externalUser.given_name && externalUser.family_name) {
        updateArgs.firstName = externalUser.given_name;
        updateArgs.lastName = externalUser.family_name;
      } else {
        const { firstName, lastName } = guessFirstAndLastNameFromFullName(
          externalUser.name
        );
        updateArgs.firstName = firstName;
        updateArgs.lastName = lastName || "";
      }
    }

    if (
      user.username !== updateArgs.username ||
      user.firstName !== updateArgs.firstName ||
      user.lastName !== updateArgs.lastName ||
      user.email !== updateArgs.email
    ) {
      await user.updateInfo(
        updateArgs.username,
        updateArgs.firstName,
        updateArgs.lastName,
        updateArgs.email
      );
    }

    return { user, created: false };
  } else {
    const { firstName, lastName } = guessFirstAndLastNameFromFullName(
      externalUser.name
    );

    const u = await UserResource.makeNew({
      sId: generateLegacyModelSId(),
      auth0Sub: externalUser.sub,
      provider: mapAuth0ProviderToLegacy(session)?.provider ?? null,
      username: externalUser.nickname,
      email: sanitizeString(externalUser.email),
      name: externalUser.name,
      firstName: externalUser.given_name ?? firstName,
      lastName: externalUser.family_name ?? lastName,
    });

    ServerSideTracking.trackSignup({
      user: {
        sId: u.sId,
        id: u.id,
        createdAt: u.createdAt.getTime(),
        provider: u.provider,
        username: u.username,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        image: u.imageUrl,
        fullName: u.name,
      },
    });

    return { user: u, created: true };
  }
}
