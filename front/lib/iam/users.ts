import type { Session } from "@auth0/nextjs-auth0";
import type { UserProviderType, UserType } from "@dust-tt/types";

import { trackSignup } from "@app/lib/amplitude/back";
import type { ExternalUser, SessionWithUser } from "@app/lib/iam/provider";
import { User } from "@app/lib/models/user";
import { guessFirstandLastNameFromFullName } from "@app/lib/user";

interface LegacyProviderInfo {
  provider: UserProviderType;
  providerId: number | string;
}

async function fetchUserWithLegacyProvider(
  { provider, providerId }: LegacyProviderInfo,
  sub: string
) {
  const user = await User.findOne({
    where: {
      provider,
      providerId: providerId.toString(),
    },
  });

  // If a legacy user is found, attach the Auth0 user ID (sub) to the existing user account.
  if (user) {
    await user.update({ auth0Sub: sub });
  }

  return user;
}

async function fetchUserWithAuth0Sub(sub: string) {
  const userWithAuth0 = await User.findOne({
    where: {
      auth0Sub: sub,
    },
  });

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
  user: User,
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
): Promise<User> {
  const { user: externalUser } = session;

  const user = await fetchUserFromSession(session);

  if (user) {
    // We only update the user's email if the email is verified.
    if (externalUser.email_verified) {
      user.email = externalUser.email;
    }

    // Update the user object from the updated session information.
    user.username = externalUser.nickname;
    user.name = externalUser.name;

    if (!user.firstName && !user.lastName) {
      if (externalUser.given_name && externalUser.family_name) {
        user.firstName = externalUser.given_name;
        user.lastName = externalUser.family_name;
      } else {
        const { firstName, lastName } = guessFirstandLastNameFromFullName(
          externalUser.name
        );
        user.firstName = firstName;
        user.lastName = lastName;
      }
    }

    await user.save();

    return user;
  } else {
    const { firstName, lastName } = guessFirstandLastNameFromFullName(
      externalUser.name
    );

    const u = await User.create({
      auth0Sub: externalUser.sub,
      provider: mapAuth0ProviderToLegacy(session)?.provider,
      username: externalUser.nickname,
      email: externalUser.email,
      name: externalUser.name,
      firstName: externalUser.given_name ?? firstName,
      lastName: externalUser.family_name ?? lastName,
    });

    trackSignup({
      id: u.id,
      createdAt: u.createdAt.getTime(),
      provider: u.provider,
      username: u.username,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      image: u.imageUrl,
      fullName: u.name,
    } satisfies UserType);

    return u;
  }
}
