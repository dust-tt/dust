import type { Agent, Conversation, User } from "./types";

/** Whoever a conversation list can be read against: an agent or a person. */
export type Collaborator =
  | { type: "agent"; data: Agent }
  | { type: "person"; data: User };

/**
 * The conversations the user has had with one collaborator. A collaborator
 * nobody has written to yet gets a plausible history instead of an empty
 * screen, drawn from its id so it stays the same across renders.
 */
export function getCollaboratorConversations(
  allConversations: Conversation[],
  userId: string,
  collaborator: Collaborator
): Conversation[] {
  const id = collaborator.data.id;
  const existing = allConversations.filter((conv) => {
    if (!conv.userParticipants.includes(userId)) {
      return false;
    }
    if (collaborator.type === "agent") {
      return conv.agentParticipants.includes(id);
    }
    return conv.userParticipants.includes(id);
  });
  if (existing.length > 0) {
    return existing;
  }

  const titles = [
    "Quick question",
    "Follow-up discussion",
    "Project update",
    "Weekly sync",
    "Planning session",
  ];
  const seed = id.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const count = (seed % 4) + 3;
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = ((seed + i * 7) % 35) + 1;
    const updatedAt = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const title = titles[(seed + i) % titles.length];
    return {
      id: `generated-conv-${id}-${i}`,
      title,
      createdAt: new Date(updatedAt.getTime() - 2 * 24 * 60 * 60 * 1000),
      updatedAt,
      userParticipants:
        collaborator.type === "person" ? [userId, id] : [userId],
      agentParticipants: collaborator.type === "agent" ? [id] : [],
      description: `Conversation about ${title.toLowerCase()}`,
    };
  });
}
