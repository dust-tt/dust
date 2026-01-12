import {
  Avatar,
  Button,
  CheckIcon,
  Counter,
  ListGroup,
  ListItem,
  ListItemSection,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

import { getAgentById } from "../data/agents";
import type { Agent, Conversation, Space, User } from "../data/types";
import { getUserById } from "../data/users";

interface InboxViewProps {
  spaces: Space[];
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  onConversationClick?: (conversation: Conversation) => void;
}

// Helper function to get random participants for a conversation
function getRandomParticipants(
  conversation: Conversation,
  _users: User[],
  _agents: Agent[]
): Array<{ type: "user" | "agent"; data: User | Agent }> {
  const allParticipants: Array<{ type: "user" | "agent"; data: User | Agent }> =
    [];

  // Add user participants
  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  // Add agent participants
  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  // Shuffle and select 1-6 participants
  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

// Helper function to get random creator from people
function getRandomCreator(
  conversation: Conversation,
  _users: User[]
): User | null {
  if (conversation.userParticipants.length === 0) {
    return null;
  }
  const creatorId =
    conversation.userParticipants[
      Math.floor(Math.random() * conversation.userParticipants.length)
    ];
  return getUserById(creatorId) || null;
}

// Convert participants to Avatar props format for Avatar.Stack
function participantsToAvatarProps(
  participants: Array<{ type: "user" | "agent"; data: User | Agent }>
) {
  return participants.map((participant) => {
    if (participant.type === "user") {
      const user = participant.data as User;
      return {
        name: user.fullName,
        visual: user.portrait,
        isRounded: true,
      };
    } else {
      const agent = participant.data as Agent;
      return {
        name: agent.name,
        emoji: agent.emoji,
        backgroundColor: agent.backgroundColor,
        isRounded: false,
      };
    }
  });
}

export function InboxView({
  spaces,
  conversations,
  users,
  agents,
  onConversationClick,
}: InboxViewProps) {
  // Filter conversations that have a spaceId and are "unread" (for demo, use recent conversations)
  const unreadConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return conversations.filter((conv) => {
      // Must have a spaceId
      if (!conv.spaceId) return false;
      // For demo: consider conversations updated in the last 2 days as "unread"
      return conv.updatedAt >= twoDaysAgo;
    });
  }, [conversations]);

  // Group conversations by spaceId and limit to 1-4 per space
  const conversationsBySpace = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();

    unreadConversations.forEach((conv) => {
      if (conv.spaceId) {
        const existing = grouped.get(conv.spaceId) || [];
        existing.push(conv);
        grouped.set(conv.spaceId, existing);
      }
    });

    // Sort each space's conversations by updatedAt (most recent first)
    // and limit to 1-4 per space
    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, spaceId) => {
      const sorted = [...convs].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      // Limit to 1-4 messages per space
      const limit = Math.min(
        Math.max(1, Math.floor(Math.random() * 4) + 1),
        sorted.length
      );
      result.set(spaceId, sorted.slice(0, limit));
    });

    return result;
  }, [unreadConversations]);

  // Filter spaces to only show those with unread conversations
  const spacesWithUnread = useMemo(() => {
    return spaces.filter((space) => conversationsBySpace.has(space.id));
  }, [spaces, conversationsBySpace]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background s-px-6">
      <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto">
        <div className="s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-py-8">
          <h2 className="s-mb-4 s-mt-6 s-text-2xl s-font-semibold s-text-foreground dark:s-text-foreground-night">
            Inbox
          </h2>
          {spacesWithUnread.length > 0 ? (
            <div className="s-flex s-flex-col s-gap-3">
              {spacesWithUnread.map((space) => {
                const spaceConversations =
                  conversationsBySpace.get(space.id) || [];
                if (spaceConversations.length === 0) return null;

                return (
                  <div key={space.id} className="s-flex s-flex-col">
                    <div className="s-flex s-flex-col">
                      <ListItemSection
                        size="sm"
                        action={
                          <Button
                            label="Mark as read"
                            icon={CheckIcon}
                            size="xs"
                            variant="outline"
                          />
                        }
                      >
                        Activity in{" "}
                        <span className="s-italic">"{space.name}"</span>
                      </ListItemSection>
                      <ListGroup>
                        {spaceConversations.map((conversation) => {
                          const participants = getRandomParticipants(
                            conversation,
                            users,
                            agents
                          );
                          const creator = getRandomCreator(conversation, users);
                          const avatarProps =
                            participantsToAvatarProps(participants);

                          // Format time from updatedAt
                          const time = conversation.updatedAt
                            .toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })
                            .replace("24:", "00:");

                          // Generate random message count (1-4)
                          const messageCount = Math.floor(
                            Math.random() * 4 + 1
                          );

                          return (
                            <ListItem
                              key={conversation.id}
                              onClick={() => {
                                onConversationClick?.(conversation);
                              }}
                              groupName="conversation-item"
                            >
                              {creator ? (
                                <Avatar
                                  name={creator.fullName}
                                  visual={creator.portrait}
                                  size="sm"
                                  isRounded={true}
                                />
                              ) : null}
                              <div className="s-mb-0.5 s-flex s-min-w-0 s-grow s-flex-col s-gap-1">
                                <div className="s-heading-sm s-flex s-w-full s-items-center s-justify-between s-gap-2 s-text-foreground dark:s-text-foreground-night">
                                  <div className="s-flex s-gap-2">
                                    {creator && creator.fullName}
                                    <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                                      {conversation.title}
                                    </span>
                                  </div>
                                  <div className="s-flex s-items-center s-gap-2 s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                                    <span className="s-font-normal">
                                      {time}
                                    </span>
                                    <Counter
                                      value={messageCount}
                                      size="xs"
                                      variant="highlight"
                                    />
                                  </div>
                                </div>
                                {conversation.description && (
                                  <div className="s-line-clamp-2 s-text-sm s-font-normal s-text-muted-foreground dark:s-text-muted-foreground-night">
                                    {conversation.description}
                                  </div>
                                )}
                                <div className="s-heading-xs s-flex s-items-center s-gap-2 s-pt-2 s-text-muted-foreground dark:s-text-muted-foreground-night">
                                  <Avatar.Stack
                                    avatars={avatarProps}
                                    nbVisibleItems={3}
                                    onTop="first"
                                    size="xs"
                                  />
                                  {Math.floor(Math.random() * 8) + 1} replies.
                                  <span className="s-font-normal">
                                    Last from @seb 5 minutes ago.
                                  </span>
                                </div>
                              </div>
                            </ListItem>
                          );
                        })}
                      </ListGroup>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="s-flex s-items-center s-justify-center s-py-12">
              <p className="s-text-muted-foreground dark:s-text-muted-foreground-night">
                No unread messages
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
