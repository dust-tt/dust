import { getAgentAvatarProps } from "../data/agentAvatarProps";
import { getAgentById } from "../data/agents";
import type {
  Agent,
  Conversation,
  ConversationItem,
  ConversationMessage,
  MessageGroupData,
  MessageGroupType,
  User,
} from "../data/types";
import { getUserById } from "../data/users";

export interface BuildConversationItemsParams {
  conversation: Conversation;
  locutor: User;
  users: User[];
  agents: Agent[];
  conversationsWithMessages: Conversation[];
}

/**
 * Builds the conversation item list for thread UIs (same logic as legacy ConversationView).
 */
export function buildConversationItemsToDisplay({
  conversation,
  locutor,
  users,
  agents,
  conversationsWithMessages,
}: BuildConversationItemsParams): ConversationItem[] {
  if (conversation.messages && conversation.messages.length > 0) {
    return conversation.messages;
  }

  if (conversationsWithMessages.length === 0) {
    return [];
  }

  const randomIndex = Math.floor(
    Math.random() * conversationsWithMessages.length
  );
  const sourceConversation = conversationsWithMessages[randomIndex];
  const sourceItems = sourceConversation.messages || [];

  if (sourceItems.length === 0) {
    return [];
  }

  const getUserByOwnerId = (id: string): User | undefined =>
    getUserById(id) || users.find((user) => user.id === id);

  const getAgentByOwnerId = (id: string): Agent | undefined =>
    getAgentById(id) || agents.find((agent) => agent.id === id);

  const currentUserParticipants = conversation.userParticipants;
  const currentAgentParticipants = conversation.agentParticipants;

  let userMessageCount = 0;
  let agentMessageCount = 0;
  const otherUsers = currentUserParticipants.filter((id) => id !== locutor.id);

  const getMappedUserId = () => {
    if (userMessageCount === 0 || userMessageCount % 2 === 0) {
      return locutor.id;
    }
    if (otherUsers.length > 0) {
      const mappedIndex =
        Math.floor((userMessageCount - 1) / 2) % otherUsers.length;
      return otherUsers[mappedIndex];
    }
    return locutor.id;
  };

  const getMappedAgentId = (fallbackId: string) => {
    if (currentAgentParticipants.length > 0) {
      const mappedIndex = agentMessageCount % currentAgentParticipants.length;
      return currentAgentParticipants[mappedIndex];
    }
    return fallbackId;
  };

  const resolveGroupType = (
    ownerType: ConversationMessage["ownerType"],
    ownerId: string
  ): MessageGroupType => {
    if (ownerType === "agent") {
      return "agent";
    }
    return ownerId === locutor.id ? "locutor" : "interlocutor";
  };

  const resolveGroupData = (
    message: ConversationMessage,
    ownerId: string,
    groupType: MessageGroupType
  ): MessageGroupData => {
    const owner =
      message.ownerType === "agent"
        ? getAgentByOwnerId(ownerId)
        : getUserByOwnerId(ownerId);
    const name =
      groupType === "locutor"
        ? undefined
        : owner && "name" in owner
          ? owner.name
          : owner && "fullName" in owner
            ? owner.fullName
            : message.group.name;

    const avatar =
      groupType === "agent"
        ? owner && "emoji" in owner
          ? { emoji: owner.emoji, backgroundColor: owner.backgroundColor }
          : message.group.avatar
        : groupType === "interlocutor"
          ? owner && "portrait" in owner
            ? { visual: owner.portrait, isRounded: true }
            : message.group.avatar
          : message.group.avatar;

    return {
      ...message.group,
      type: groupType,
      name,
      avatar,
    };
  };

  return sourceItems.map((item, index) => {
    if (item.kind !== "message") {
      if (item.kind === "activeIndicator") {
        if (item.type === "agent" && currentAgentParticipants.length > 0) {
          const agentId = currentAgentParticipants[0];
          const agent = getAgentByOwnerId(agentId);
          return {
            ...item,
            name: agent?.name ?? item.name,
            avatar: agent ? getAgentAvatarProps(agent) : item.avatar,
          };
        }
        if (item.type === "interlocutor") {
          const userId = otherUsers[0] ?? locutor.id;
          const user = getUserByOwnerId(userId);
          return {
            ...item,
            name: user?.fullName ?? item.name,
            avatar: user?.portrait
              ? { visual: user.portrait, isRounded: true }
              : item.avatar,
          };
        }
      }
      return item;
    }

    let newOwnerId = item.ownerId;
    if (item.ownerType === "user") {
      newOwnerId = getMappedUserId();
      userMessageCount++;
    } else if (item.ownerType === "agent") {
      newOwnerId = getMappedAgentId(item.ownerId);
      agentMessageCount++;
    }

    const groupType = resolveGroupType(item.ownerType, newOwnerId);

    return {
      ...item,
      id: `${conversation.id}-msg-${index}`,
      ownerId: newOwnerId,
      group: resolveGroupData(item, newOwnerId, groupType),
    };
  });
}
