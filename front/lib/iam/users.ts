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
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { guessFirstAndLastNameFromFullName } from "@app/lib/user";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok, sanitizeString } from "@app/types";

/**
 * Soft HTML escaping that prevents HTML tag injection while preserving apostrophes and other common characters.
 * Only escapes < and > which are the minimal characters needed to prevent HTML tag injection.
 */
function softHtmlEscape(str: string): string {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function fetchUserFromSession(session: SessionWithUser) {
  const { workOSUserId } = session.user;

  if (workOSUserId) {
    return UserResource.fetchByWorkOSUserId(workOSUserId);
  }

  return null;
}

export async function maybeUpdateFromExternalUser(
  user: UserResource,
  externalUser: ExternalUser
) {
  // Only hydrate the user's image from the IdP if the user
  // doesn't have a custom image yet. This prevents overwriting
  // a profile picture the user uploaded via the app (same pattern
  // as agent avatars which persist once set).
  if (!user.imageUrl && externalUser.picture) {
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
  forceNameUpdate = false,
}: {
  user: UserResource | null;
  externalUser: ExternalUser;
  forceNameUpdate?: boolean;
}): Promise<{ user: UserResource; created: boolean }> {
  if (user) {
    const updateArgs: { [key: string]: string } = {};

    // We only update the user's email if the email is verified.
    if (externalUser.email_verified) {
      updateArgs.email = externalUser.email;
    }

    // Update the user object from the updated session information.
    updateArgs.username = externalUser.nickname;

    if ((!user.firstName && !user.lastName) || forceNameUpdate) {
      if (externalUser.given_name && externalUser.family_name) {
        updateArgs.firstName = softHtmlEscape(externalUser.given_name);
        updateArgs.lastName = softHtmlEscape(externalUser.family_name);
      } else {
        const { firstName, lastName } = guessFirstAndLastNameFromFullName(
          externalUser.name
        );
        updateArgs.firstName = softHtmlEscape(firstName);
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        updateArgs.lastName = softHtmlEscape(lastName || "");
      }
    }

    if (
      externalUser.workOSUserId &&
      externalUser.workOSUserId !== user.workOSUserId
    ) {
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

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    firstName = softHtmlEscape(externalUser.given_name || firstName);
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    lastName = externalUser.family_name || lastName;
    if (lastName) {
      lastName = softHtmlEscape(lastName);
    }

    // If worksOSUserId is already taken, we don't want to take it - only one user can have the same workOSUserId.
    const existingWorkOSUser = externalUser.workOSUserId
      ? await UserResource.fetchByWorkOSUserId(externalUser.workOSUserId)
      : null;

    const u = await UserResource.makeNew({
      sId: generateRandomModelSId(),
      auth0Sub: externalUser.auth0Sub,
      workOSUserId: existingWorkOSUser ? null : externalUser.workOSUserId,
      provider: null, ///session.provider
      username: externalUser.nickname,
      email: sanitizeString(externalUser.email),
      name: externalUser.name,
      firstName,
      lastName,
      imageUrl: externalUser.picture,
      lastLoginAt: null,
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
  const conversations = await ConversationParticipantModel.findAll({
    where: {
      userId: primaryUser.id,
      workspaceId: workspaceId,
    },
    attributes: ["conversationId"],
  });
  await ConversationParticipantModel.destroy({
    where: {
      userId: secondaryUser.id,
      conversationId: conversations.map((p) => p.conversationId),
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
  // Migrate authorship of agent memories from the secondary user to the primary user.
  await AgentMemoryModel.update(userIdValues, userIdOptions);

  // Delete all group memberships for the secondary user that are already member.
  const groups = await GroupMembershipModel.findAll({
    where: {
      userId: primaryUser.id,
      workspaceId: workspaceId,
    },
    attributes: ["groupId"],
  });
  await GroupMembershipModel.destroy({
    where: {
      userId: secondaryUser.id,
      groupId: groups.map((p) => p.groupId),
      workspaceId: workspaceId,
    },
  });
  // Replace all group memberships for the secondary user with the primary user.
  await GroupMembershipModel.update(userIdValues, userIdOptions);

  // Delete all agent-user relations for the secondary user that already have a relation.
  const agentConfigurations = await AgentUserRelation.findAll({
    where: {
      userId: primaryUser.id,
      workspaceId: workspaceId,
    },
    attributes: ["agentConfiguration"],
  });
  await AgentUserRelation.destroy({
    where: {
      userId: secondaryUser.id,
      agentConfiguration: agentConfigurations.map((p) => p.agentConfiguration),
      workspaceId: workspaceId,
    },
  });
  // Migrate agent-user relations from the secondary user to the primary user.
  await AgentUserRelation.update(userIdValues, userIdOptions);

  // Migrate authorship of keys from the secondary user to the primary user.
  await KeyModel.update(userIdValues, userIdOptions);

  if (
    primaryUser.email === secondaryUser.email &&
    secondaryUser.workOSUserId &&
    !primaryUser.workOSUserId
  ) {
    const workOSUserId = secondaryUser.workOSUserId;
    await UserModel.update(
      {
        workOSUserId: null,
      },
      {
        where: {
          id: secondaryUser.id,
        },
      }
    );
    await UserModel.update(
      {
        workOSUserId,
      },
      {
        where: {
          id: primaryUser.id,
        },
      }
    );
  }

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
