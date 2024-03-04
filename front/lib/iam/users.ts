import type { Session } from "next-auth";

import { isGoogleSession } from "@app/lib/iam/session";
import { User } from "@app/lib/models/user";
import { guessFirstandLastNameFromFullName } from "@app/lib/user";

interface LegacyProviderInfo {
  provider: "google" | "github";
  providerId: string;
}

async function fetchUserWithLegacyProvider({
  provider,
  providerId,
}: LegacyProviderInfo) {
  const user = await User.findOne({
    where: {
      provider,
      providerId,
    },
  });

  // TODO(2024-03-04 flav) Once migrating to new auth system, backfill here.

  return user;
}

export async function fetchUserFromSession(session: any) {
  const { provider } = session;

  const legacyProviderInfo: LegacyProviderInfo = {
    provider: provider.provider,
    providerId: provider.id,
  };

  return fetchUserWithLegacyProvider(legacyProviderInfo);
}

export async function maybeUpdateFromExternalUser(
  user: User,
  externalUser: Session["user"]
) {
  if (externalUser?.image && externalUser.image !== user.imageUrl) {
    void User.update(
      {
        imageUrl: externalUser.image,
      },
      {
        where: {
          id: user.id,
        },
      }
    );
  }
}

export async function createOrUpdateUser(session: any): Promise<User> {
  const user = await User.findOne({
    where: {
      provider: session.provider.provider,
      providerId: session.provider.id.toString(),
    },
  });

  const { user: externalUser } = session;
  // TODO(2024-03-04 flav): Remove when deprecating next-auth.
  externalUser.email_verified = isGoogleSession(session);

  if (user) {
    // Update the user object from the updated session information.
    user.username = externalUser.username;
    user.name = externalUser.name;

    // We only update the user's email if the email is verified.
    if (externalUser.email_verified) {
      user.email = externalUser.email;
    }

    if (!user.firstName && !user.lastName) {
      const { firstName, lastName } = guessFirstandLastNameFromFullName(
        externalUser.name
      );
      user.firstName = firstName;
      user.lastName = lastName;
    }

    await user.save();

    return user;
  } else {
    const { firstName, lastName } = guessFirstandLastNameFromFullName(
      session.user.name
    );

    return User.create({
      provider: session.provider.provider,
      providerId: session.provider.id.toString(),
      username: session.user.username,
      email: session.user.email,
      name: session.user.name,
      firstName,
      lastName,
    });
  }
}
