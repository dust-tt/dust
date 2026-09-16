import type { Agent, Conversation, Space, User } from "./types";

export const MY_POD_SPACE_ID = "my-pod";

export const MY_POD_SPACE: Space = {
  id: MY_POD_SPACE_ID,
  name: "My Pod",
  description:
    "Your personal workspace for private conversations, tasks, and files.",
};

export type MyPodConversationFilter = "all" | "mine" | "group" | "triggered";

export function getMyPodConversations(
  conversations: Conversation[]
): Conversation[] {
  return conversations.filter((conv) => !conv.spaceId);
}

function myPodSeedRandom(seed: string, index: number): number {
  const hash = seed
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const x = Math.sin((hash + index) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function isMyPodMineConversation(
  conversation: Conversation,
  currentUserId: string
): boolean {
  return (
    conversation.userParticipants.length === 1 &&
    conversation.userParticipants[0] === currentUserId &&
    conversation.agentParticipants.length >= 1
  );
}

export function isMyPodGroupConversation(conversation: Conversation): boolean {
  return conversation.userParticipants.length > 1;
}

/**
 * Automated work is never anything but a trigger's run, so the trigger it came
 * from is the whole test: no trigger, no automation, whoever is in the room.
 */
export function isTriggeredConversation(conversation: Conversation): boolean {
  return conversation.triggerId !== undefined;
}

export function matchesMyPodConversationFilter(
  conversation: Conversation,
  filter: MyPodConversationFilter,
  currentUserId: string
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "mine":
      return isMyPodMineConversation(conversation, currentUserId);
    case "group":
      return isMyPodGroupConversation(conversation);
    case "triggered":
      return isTriggeredConversation(conversation);
  }
}

export function enrichMyPodConversationParticipants(
  conversation: Conversation,
  currentUserId: string,
  users: User[],
  agents: Agent[]
): Conversation {
  const otherUsers = users.filter((user) => user.id !== currentUserId);
  const bucket = Math.floor(myPodSeedRandom(conversation.id, 0) * 3);

  if (bucket === 0) {
    const agent =
      agents[Math.floor(myPodSeedRandom(conversation.id, 1) * agents.length)];
    return {
      ...conversation,
      userParticipants: [currentUserId],
      agentParticipants: agent ? [agent.id] : [],
    };
  }

  if (bucket === 1) {
    const targetGroupSize = Math.min(
      2 + Math.floor(myPodSeedRandom(conversation.id, 2) * 2),
      users.length
    );
    const groupUsers = [currentUserId];
    const shuffledOthers = [...otherUsers].sort(
      (a, b) =>
        myPodSeedRandom(`${conversation.id}-${a.id}`, 0) -
        myPodSeedRandom(`${conversation.id}-${b.id}`, 0)
    );
    for (
      let i = 0;
      i < shuffledOthers.length && groupUsers.length < targetGroupSize;
      i++
    ) {
      groupUsers.push(shuffledOthers[i].id);
    }
    if (groupUsers.length < 2) {
      const fallbackUser = users.find((user) => user.id !== currentUserId);
      if (fallbackUser) {
        groupUsers.push(fallbackUser.id);
      }
    }

    const includeAgent =
      agents.length > 0 && myPodSeedRandom(conversation.id, 3) > 0.35;
    const agent = includeAgent
      ? agents[Math.floor(myPodSeedRandom(conversation.id, 4) * agents.length)]
      : undefined;

    return {
      ...conversation,
      userParticipants: groupUsers,
      agentParticipants: agent ? [agent.id] : [],
    };
  }

  if (agents.length === 0) {
    return {
      ...conversation,
      userParticipants: [currentUserId],
      agentParticipants: [],
    };
  }

  const agentCount = Math.min(
    1 + Math.floor(myPodSeedRandom(conversation.id, 5) * 2),
    agents.length
  );
  const shuffledAgents = [...agents].sort(
    (a, b) =>
      myPodSeedRandom(`${conversation.id}-${a.id}`, 0) -
      myPodSeedRandom(`${conversation.id}-${b.id}`, 0)
  );

  // The last bucket is you and a couple of agents. A conversation with no
  // human in it at all would be automated work, and that only ever comes from
  // a trigger.
  return {
    ...conversation,
    userParticipants: [currentUserId],
    agentParticipants: shuffledAgents
      .slice(0, agentCount)
      .map((agent) => agent.id),
  };
}
