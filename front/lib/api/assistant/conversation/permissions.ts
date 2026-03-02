import { getContentFragmentSpaceIds } from "@app/lib/api/assistant/permissions";
import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";

/**
 * Check if a user can access a conversation based on space permissions.
 * Returns true if the user has read access to all required spaces.
 */
export async function canUserAccessConversation(
  auth: Authenticator,
  {
    userId,
    conversationId,
  }: {
    userId: string;
    conversationId: string;
  }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  const fakeAuth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspace.sId
  );

  const canAccess = await ConversationResource.canAccess(
    fakeAuth,
    conversationId
  );

  return canAccess === "allowed";
}

/**
 * Check if a user is a member of a space (project).
 */
export async function isUserMemberOfSpace(
  auth: Authenticator,
  {
    userId,
    spaceId,
  }: {
    userId: string;
    spaceId: string;
  }
): Promise<boolean> {
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return false;
  }

  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    auth.getNonNullableWorkspace().sId
  );

  if (!userAuth) {
    return false;
  }

  return space.isMember(userAuth);
}

/**
 * Check if the current user can add members to a project space.
 */
export async function canCurrentUserAddProjectMembers(
  auth: Authenticator,
  spaceId: string,
  mentionedUserId: string
): Promise<boolean> {
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return false;
  }
  return space.canAddMember(auth, mentionedUserId);
}

export async function canAgentBeUsedInProjectConversation(
  auth: Authenticator,
  {
    configuration,
    conversation,
  }: {
    configuration: LightAgentConfigurationType;
    conversation: ConversationWithoutContentType;
  }
): Promise<boolean> {
  if (!isProjectConversation(conversation)) {
    throw new Error("Unexpected: conversation is not a project conversation");
  }
  // In case of Project's conversation, we need to check if the agent configuration is using only the project spaces or open spaces, otherwise we reject the mention and do not create the agent message.
  // Check to skip heavy work if the agent configuration is only using the project space.
  if (
    configuration.requestedSpaceIds.some(
      (spaceId) => spaceId !== conversation.spaceId
    )
  ) {
    // Need to load all the spaces to check if they are restricted.
    const spaces = await SpaceResource.fetchByIds(
      auth,
      configuration.requestedSpaceIds.filter(
        (spaceId) => spaceId !== conversation.spaceId
      )
    );
    if (spaces.some((space) => !space.isOpen())) {
      return false;
    }
  }

  return true;
}

/**
 * Update the conversation requestedSpaceIds based on the mentioned agents. This function is purely
 * additive - requirements are never removed.
 *
 * Each agent's requestedSpaceIds represents a set of requirements that must be satisfied. When an
 * agent is mentioned in a conversation, its requirements are added to the conversation's
 * requirements.
 *
 * - Within each requirement (sub-array), groups are combined with OR logic.
 * - Different requirements (different sub-arrays) are combined with AND logic.
 */
export async function updateConversationRequirements(
  auth: Authenticator,
  {
    agents,
    contentFragment,
    conversation,
    t,
  }: {
    agents?: LightAgentConfigurationType[];
    contentFragment?: ContentFragmentInputWithContentNode;
    conversation: ConversationWithoutContentType;
    t?: Transaction;
  }
): Promise<void> {
  // !!! IMPORTANT !!!
  // By design, project conversations are always visible to everyone that have READ permission to the project.
  // Therefor we strip all the space requirements from the conversation.
  // It means that we rely on agents and content fragments permissions checking to have happened before.
  // It also means that if we "move" a conversation to a project, we need to update the conversation requirements and we make it visibel
  if (isProjectConversation(conversation)) {
    const spaceModelId = getResourceIdFromSId(conversation.spaceId);
    if (spaceModelId === null) {
      throw new Error("Unexpected: invalid space sId in conversation.");
    }
    if (
      conversation.requestedSpaceIds.length !== 1 ||
      conversation.requestedSpaceIds[0] !== conversation.spaceId
    ) {
      await ConversationResource.updateRequirements(
        auth,
        conversation.sId,
        [spaceModelId],
        t
      );
    }
    return;
  }

  let newSpaceRequirements: string[] = [];

  if (agents) {
    newSpaceRequirements = agents.flatMap((agent) => agent.requestedSpaceIds);
  }
  if (contentFragment) {
    const requestedSpaceId = await getContentFragmentSpaceIds(
      auth,
      contentFragment
    );

    newSpaceRequirements.push(requestedSpaceId);
  }

  newSpaceRequirements = uniq(newSpaceRequirements);

  const currentSpaceRequirements = conversation.requestedSpaceIds;

  const areAllSpaceRequirementsPresent = newSpaceRequirements.every((newReq) =>
    currentSpaceRequirements.includes(newReq)
  );

  // Early return if all new requirements are already present.
  if (areAllSpaceRequirementsPresent) {
    return;
  }

  // Get missing requirements.
  const spaceRequirementsToAdd = newSpaceRequirements.filter(
    (newReq) => !currentSpaceRequirements.includes(newReq)
  );

  // Convert all sIds to modelIds.
  const sIdToModelId = new Map<string, number>();
  const getModelId = (sId: string) => {
    if (!sIdToModelId.has(sId)) {
      const id = getResourceIdFromSId(sId);
      if (id === null) {
        throw new Error("Unexpected: invalid group id");
      }
      sIdToModelId.set(sId, id);
    }
    return sIdToModelId.get(sId)!;
  };

  const allSpaceRequirements = [
    ...currentSpaceRequirements.map(getModelId),
    ...spaceRequirementsToAdd.map(getModelId),
  ];

  await ConversationResource.updateRequirements(
    auth,
    conversation.sId,
    allSpaceRequirements,
    t
  );
}
