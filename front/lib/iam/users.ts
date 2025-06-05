import type { PostIdentitiesRequestProviderEnum } from "auth0";
import { escape } from "html-escaper";

import { getAuth0ManagemementClient } from "@app/lib/api/auth0";
import { revokeAndTrackMembership } from "@app/lib/api/membership";
import type { Authenticator } from "@app/lib/auth";
import type { ExternalUser, SessionWithUser } from "@app/lib/iam/provider";
import {
  AgentConfiguration,
  AgentUserRelation,
} from "@app/lib/models/assistant/agent";
import {
  ConversationParticipantModel,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { guessFirstAndLastNameFromFullName } from "@app/lib/user";
import logger from "@app/logger/logger";
import type { Result, UserProviderType } from "@app/types";
import { Err, Ok, sanitizeString } from "@app/types";

interface LegacyProviderInfo {
  provider: UserProviderType;
  providerId: number | string;
}

//TODO(workos): Clean up legacy provider.
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
    await user.updateAuth0Sub({ sub, provider });
  }

  return user;
}

function mapAuth0ProviderToLegacy(auth0Sub: string): LegacyProviderInfo {
  const [rawProvider, providerId] = auth0Sub.split("|");
  switch (rawProvider) {
    case "google-oauth2":
      return { provider: "google", providerId };

    case "github":
      return { provider: "github", providerId };

    default:
      return { provider: rawProvider as UserProviderType, providerId };
  }
}
//END-TODO(workos)

export async function fetchUserFromSession(session: SessionWithUser) {
  const { workOSUserId, auth0Sub } = session.user;

  if (session.type === "workos" && workOSUserId) {
    const userWithWorkOS = await UserResource.fetchByWorkOSUserId(workOSUserId);
    if (userWithWorkOS) {
      return userWithWorkOS;
    }
  }

  //TODO(workos): Remove auth0 user lookup.
  if (session.type === "auth0" && auth0Sub) {
    const userWithAuth0 = await UserResource.fetchByAuth0Sub(auth0Sub);
    if (userWithAuth0) {
      return userWithAuth0;
    }

    const legacyProviderInfo = mapAuth0ProviderToLegacy(auth0Sub);
    return fetchUserWithLegacyProvider(legacyProviderInfo, auth0Sub);
  }

  return null;
}

export async function maybeUpdateFromExternalUser(
  user: UserResource,
  externalUser: ExternalUser
) {
  if (externalUser.picture && externalUser.picture !== user.imageUrl) {
    void UserModel.update(
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

export async function createOrUpdateUser({
  user,
  externalUser,
}: {
  user: UserResource | null;
  externalUser: ExternalUser;
}): Promise<{ user: UserResource; created: boolean }> {
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

    if (externalUser.workOSUserId) {
      const existingWorkOSUser = externalUser.workOSUserId
        ? await UserResource.fetchByWorkOSUserId(externalUser.workOSUserId)
        : null;

      // If worksOSUserId is already taken, we don't want to take it - only one user can have the same workOSUserId.
      if (!existingWorkOSUser) {
        updateArgs.workOSUserId = externalUser.workOSUserId;
      } else {
        logger.warn(
          {
            userId: user.id,
            workOSUserId: externalUser.workOSUserId,
            existingUserId: existingWorkOSUser.id,
          },
          `User tried to update their workOSUserId, but it was already taken.`
        );
      }
    }

    if (Object.keys(updateArgs).length > 0) {
      const needsUpdate = Object.entries(updateArgs).some(
        ([key, value]) => user[key as keyof typeof user] !== value
      );

      if (needsUpdate) {
        await user.updateInfo(
          updateArgs.username || user.name,
          updateArgs.firstName || user.firstName,
          updateArgs.lastName || user.lastName,
          updateArgs.email || user.email,
          updateArgs.workOSUserId || user.workOSUserId
        );
      }
    }

    return { user, created: false };
  } else {
    let { firstName, lastName } = guessFirstAndLastNameFromFullName(
      externalUser.name
    );

    firstName = escape(externalUser.given_name || firstName);
    lastName = externalUser.family_name || lastName;
    if (lastName) {
      lastName = escape(lastName);
    }

    // If worksOSUserId is already taken, we don't want to take it - only one user can have the same workOSUserId.
    const existingWorkOSUser = externalUser.workOSUserId
      ? await UserResource.fetchByWorkOSUserId(externalUser.workOSUserId)
      : null;

    const u = await UserResource.makeNew({
      sId: generateRandomModelSId(),
      auth0Sub: externalUser.auth0Sub,
      workOSUserId: existingWorkOSUser ? null : externalUser.workOSUserId,
      provider: null, ///session.provider,
      username: externalUser.nickname,
      email: sanitizeString(externalUser.email),
      name: externalUser.name,
      firstName,
      lastName,
    });

    if (existingWorkOSUser) {
      logger.warn(
        {
          userId: u.id,
          workOSUserId: externalUser.workOSUserId,
          existingUserId: existingWorkOSUser.id,
        },
        `User tried to create a new user with a workOSUserId, but it was already taken.`
      );
    }

    return { user: u, created: true };
  }
}

export async function mergeUserIdentities({
  auth,
  primaryUserId,
  secondaryUserId,
  enforceEmailMatch = true,
  revokeSecondaryUser = false,
}: {
  auth: Authenticator;
  primaryUserId: string;
  secondaryUserId: string;
  enforceEmailMatch?: boolean;
  revokeSecondaryUser?: boolean;
}): Promise<
  Result<{ primaryUser: UserResource; secondaryUser: UserResource }, Error>
> {
  if (primaryUserId === secondaryUserId) {
    return new Err(new Error("Primary and secondary user IDs are the same."));
  }

  const primaryUser = await UserResource.fetchById(primaryUserId);
  const secondaryUser = await UserResource.fetchById(secondaryUserId);
  if (!primaryUser || !secondaryUser) {
    return new Err(new Error("Primary or secondary user not found."));
  }

  if (enforceEmailMatch && primaryUser.email !== secondaryUser.email) {
    return new Err(
      new Error("Primary and secondary user emails do not match.")
    );
  }

  const workspaceId = auth.getNonNullableWorkspace().id;

  // Ensure that primary user has a membership in the workspace.
  const primaryMemberships = await MembershipResource.fetchByUserIds([
    primaryUser.id,
  ]);
  if (!primaryMemberships.some((m) => m.workspaceId === workspaceId)) {
    return new Err(
      new Error("Primary must have a membership in the workspace.")
    );
  }

  // Ensure that secondary user has a membership in the workspace.
  const secondaryMemberships = await MembershipResource.fetchByUserIds([
    secondaryUser.id,
  ]);
  if (!secondaryMemberships.some((m) => m.workspaceId === workspaceId)) {
    return new Err(
      new Error("Secondary must have a membership in the workspace.")
    );
  }

  const auth0ManagemementClient = getAuth0ManagemementClient();

  const primaryUserAuth0 =
    await auth0ManagemementClient.usersByEmail.getByEmail({
      email: primaryUser.email,
    });

  const secondaryUserAuth0 =
    await auth0ManagemementClient.usersByEmail.getByEmail({
      email: secondaryUser.email,
    });

  const primaryUserAuth0Sub = primaryUserAuth0.data.find(
    (u) => u.user_id === primaryUser.auth0Sub
  );
  const secondaryUserAuth0Sub = secondaryUserAuth0.data.find(
    (u) => u.user_id === secondaryUser.auth0Sub
  );

  if (!primaryUserAuth0Sub) {
    return new Err(new Error("Primary user not found in Auth0."));
  }

  // No auth0 sub for the secondary user, nothing to merge on that side.
  if (secondaryUserAuth0Sub) {
    const [identityToMerge] = secondaryUserAuth0Sub.identities;

    // Retrieve the connection id for the identity to merge.
    const connectionsResponse =
      await getAuth0ManagemementClient().connections.getAll({
        name: identityToMerge.connection,
      });

    const [connection] = connectionsResponse.data;
    if (!connection) {
      return new Err(
        new Error(`Auth0 connection ${identityToMerge.connection} not found.`)
      );
    }

    await auth0ManagemementClient.users.link(
      { id: primaryUserAuth0Sub.user_id },
      {
        provider: identityToMerge.provider as PostIdentitiesRequestProviderEnum,
        connection_id: connection.id,
        user_id: identityToMerge.user_id,
      }
    );

    // Mark the primary user as having been linked.
    await auth0ManagemementClient.users.update(
      { id: primaryUserAuth0Sub.user_id },
      {
        app_metadata: {
          account_linking_state: Date.now(),
        },
      }
    );
  }

  // Migrate authorship of agent configurations from the secondary user to the primary user.
  await AgentConfiguration.update(
    {
      authorId: primaryUser.id,
    },
    {
      where: {
        authorId: secondaryUser.id,
        workspaceId: workspaceId,
      },
    }
  );

  const userIdValues = {
    userId: primaryUser.id,
  };
  const userIdOptions = {
    where: {
      userId: secondaryUser.id,
      workspaceId: workspaceId,
    },
  };

  // Delete all conversation participants for the secondary user that are already in conversations with the primary user.
  await ConversationParticipantModel.destroy({
    where: {
      userId: secondaryUser.id,
      conversationId: (
        await ConversationParticipantModel.findAll({
          where: {
            userId: primaryUser.id,
            workspaceId: workspaceId,
          },
          attributes: ["conversationId"],
        })
      ).map((p) => p.conversationId),
      workspaceId: workspaceId,
    },
  });
  // Replace all conversation participants for the secondary user with the primary user.
  await ConversationParticipantModel.update(userIdValues, userIdOptions);
  // Migrate authorship of user messages from the secondary user to the primary user.
  await UserMessage.update(userIdValues, userIdOptions);
  // Migrate authorship of content fragments from the secondary user to the primary user.
  await ContentFragmentModel.update(userIdValues, userIdOptions);
  // Migrate authorship of files from the secondary user to the primary user.
  await FileModel.update(userIdValues, userIdOptions);
  await DustAppSecret.update(userIdValues, userIdOptions);

  // Delete all group memberships for the secondary user that are already member.
  await GroupMembershipModel.destroy({
    where: {
      userId: secondaryUser.id,
      groupId: (
        await GroupMembershipModel.findAll({
          where: {
            userId: primaryUser.id,
            workspaceId: workspaceId,
          },
          attributes: ["groupId"],
        })
      ).map((p) => p.groupId),
      workspaceId: workspaceId,
    },
  });
  // Replace all group memberships for the secondary user with the primary user.
  await GroupMembershipModel.update(userIdValues, userIdOptions);

  // Delete all agent-user relations for the secondary user that already have a relation.
  await AgentUserRelation.destroy({
    where: {
      userId: secondaryUser.id,
      agentConfiguration: (
        await AgentUserRelation.findAll({
          where: {
            userId: primaryUser.id,
            workspaceId: workspaceId,
          },
          attributes: ["agentConfiguration"],
        })
      ).map((p) => p.agentConfiguration),
      workspaceId: workspaceId,
    },
  });
  // Migrate agent-user relations from the secondary user to the primary user.
  await AgentUserRelation.update(userIdValues, userIdOptions);

  // Migrate authorship of keys from the secondary user to the primary user.
  await KeyModel.update(userIdValues, userIdOptions);

  if (revokeSecondaryUser) {
    await revokeAndTrackMembership(
      auth.getNonNullableWorkspace(),
      secondaryUser
    );
  }

  return new Ok({
    primaryUser,
    secondaryUser,
  });
}
