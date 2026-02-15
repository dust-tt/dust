import { revokeAndTrackMembership } from "@app/lib/api/membership";
import type { Authenticator } from "@app/lib/auth";
import type { ExternalUser, SessionWithUser } from "@app/lib/iam/provider";
import {
  AgentConfigurationModel,
  AgentUserRelationModel,
} from "@app/lib/models/agent/agent";
import { UserMessageModel } from "@app/lib/models/agent/conversation";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { AgentMemoryModel } from "@app/lib/resources/storage/models/agent_memories";
import { ContentFragmentModel } from "@app/lib/resources/storage/models/content_fragment";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { KeyModel } from "@app/lib/resources/storage/models/keys";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { guessFirstAndLastNameFromFullName } from "@app/lib/user";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { sanitizeString } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";

// WorkOS custom attributes to sync to user metadata.
// These are normalized by WorkOS and can come from SCIM or SSO.
export const CUSTOM_ATTRIBUTES_TO_SYNC = [
  "job_title",
  "department_name",
] as const;
export type CustomAttributeKey = (typeof CUSTOM_ATTRIBUTES_TO_SYNC)[number];
export const WORKOS_METADATA_KEY_PREFIX = "workos:";

// Syncs custom attributes to user metadata.
// Stores attributes with workspace scope and "workos:" prefix.
// Removes attributes that are no longer present.
export async function syncCustomAttributesToUserMetadata(
  user: UserResource,
  workspace: LightWorkspaceType,
  attributes: Record<string, string | null>
): Promise<void> {
  for (const attr of CUSTOM_ATTRIBUTES_TO_SYNC) {
    const metadataKey = `${WORKOS_METADATA_KEY_PREFIX}${attr}`;
    const value = attributes[attr] ?? null;

    if (value !== null) {
      await user.setMetadata(metadataKey, value, workspace.id);
      logger.info(
        {
          userId: user.sId,
          workspaceId: workspace.sId,
          attribute: attr,
          value,
        },
        "Synced custom attribute to user metadata"
      );
    } else {
      // Remove attribute if no longer present.
      const existing = await user.getMetadata(metadataKey, workspace.id);
      if (existing) {
        await user.deleteMetadata({
          key: metadataKey,
          workspaceId: workspace.id,
        });
        logger.info(
          { userId: user.sId, workspaceId: workspace.sId, attribute: attr },
          "Removed custom attribute from user metadata"
        );
      }
    }
  }
}

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
  if (!user.imageUrl && externalUser.picture) {
    void user.updateImage(externalUser.picture);
  }
}

export async function createOrUpdateUser({
  user,
  externalUser,
  forceNameUpdate = false,
  workspace,
}: {
  user: UserResource | null;
  externalUser: ExternalUser;
  forceNameUpdate?: boolean;
  workspace?: LightWorkspaceType;
}): Promise<{ user: UserResource; created: boolean }> {
  let resultUser: UserResource;
  let created: boolean;

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

    resultUser = user;
    created = false;
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

    resultUser = u;
    created = true;
  }

  // Sync custom attributes to user metadata if workspace is provided.
  if (workspace && externalUser.customAttributes) {
    await syncCustomAttributesToUserMetadata(
      resultUser,
      workspace,
      externalUser.customAttributes
    );
  }

  return { user: resultUser, created };
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
  await AgentConfigurationModel.update(
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

  // Merge conversation participations from secondary user to primary user.
  await ConversationResource.mergeUserParticipations(workspaceId, {
    primaryUserId: primaryUser.id,
    secondaryUserId: secondaryUser.id,
  });
  // Migrate authorship of user messages from the secondary user to the primary user.
  await UserMessageModel.update(userIdValues, userIdOptions);
  // Migrate authorship of content fragments from the secondary user to the primary user.
  await ContentFragmentModel.update(userIdValues, userIdOptions);
  // Migrate authorship of files from the secondary user to the primary user.
  await FileModel.update(userIdValues, userIdOptions);
  await DustAppSecretModel.update(userIdValues, userIdOptions);
  // Migrate authorship of agent memories from the secondary user to the primary user.
  await AgentMemoryModel.update(userIdValues, userIdOptions);

  // Migrate group memberships from secondary user to primary user
  await GroupResource.migrateUserMemberships({
    primaryUser,
    secondaryUser,
    workspace: renderLightWorkspaceType({
      workspace: auth.getNonNullableWorkspace(),
    }),
  });

  // Delete all agent-user relations for the secondary user that already have a relation.
  const agentConfigurations = await AgentUserRelationModel.findAll({
    where: {
      userId: primaryUser.id,
      workspaceId: workspaceId,
    },
    attributes: ["agentConfiguration"],
  });
  await AgentUserRelationModel.destroy({
    where: {
      userId: secondaryUser.id,
      agentConfiguration: agentConfigurations.map((p) => p.agentConfiguration),
      workspaceId: workspaceId,
    },
  });
  // Migrate agent-user relations from the secondary user to the primary user.
  await AgentUserRelationModel.update(userIdValues, userIdOptions);

  // Migrate authorship of keys from the secondary user to the primary user.
  await KeyModel.update(userIdValues, userIdOptions);

  if (
    primaryUser.email === secondaryUser.email &&
    secondaryUser.workOSUserId &&
    !primaryUser.workOSUserId
  ) {
    const workOSUserId = secondaryUser.workOSUserId;
    await secondaryUser.setWorkOSUserId(null);
    await primaryUser.setWorkOSUserId(workOSUserId);
  }

  if (revokeSecondaryUser) {
    await revokeAndTrackMembership(auth, secondaryUser);
  }

  return new Ok({
    primaryUser,
    secondaryUser,
  });
}
