import {
  Button,
  CheckIcon,
  Collapsible,
  CollapsibleContent,
  ConversationListItem,
  Icon,
  InboxIcon,
  ListGroup,
  ListItemSection,
  ReplySection,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

import { getAgentById } from "../data/agents";
import type { Agent, Conversation, Space, User } from "../data/types";
import { getUserById } from "../data/users";

interface InboxViewProps {
  spaces: Space[];
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  onConversationClick?: (conversation: Conversation) => void;
  onSpaceClick?: (space: Space) => void;
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
  onSpaceClick,
}: InboxViewProps) {
  // Track which spaces are collapsed (marked as read)
  const [collapsedSpaces, setCollapsedSpaces] = useState<Set<string>>(
    new Set()
  );

  const toggleSpaceCollapse = (spaceId: string) => {
    setCollapsedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  const toggleMyConversationsCollapse = () => {
    toggleSpaceCollapse("my-conversations");
  };

  // Filter conversations that don't have a spaceId (My conversations) and are "unread"
  const myConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const filtered = conversations.filter((conv) => {
      // Must NOT have a spaceId
      if (conv.spaceId) return false;
      // For demo: consider conversations updated in the last 2 days as "unread"
      return conv.updatedAt >= twoDaysAgo;
    });

    // Sort by updatedAt (most recent first) and limit to 1-3 items
    const sorted = [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const limit = Math.min(
      Math.max(1, Math.floor(Math.random() * 3) + 1),
      sorted.length
    );
    return sorted.slice(0, limit);
  }, [conversations]);

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

  const hasAnyContent =
    myConversations.length > 0 || spacesWithUnread.length > 0;

  // Check if all sections are collapsed (marked as read)
  const allSectionsCollapsed = useMemo(() => {
    if (!hasAnyContent) return true;

    // Check if My conversations section is collapsed (if it exists)
    const myConversationsCollapsed =
      myConversations.length === 0 || collapsedSpaces.has("my-conversations");

    // Check if all spaces are collapsed
    const allSpacesCollapsed =
      spacesWithUnread.length === 0 ||
      spacesWithUnread.every((space) => collapsedSpaces.has(space.id));

    return myConversationsCollapsed && allSpacesCollapsed;
  }, [
    hasAnyContent,
    myConversations.length,
    spacesWithUnread,
    collapsedSpaces,
  ]);

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background s-px-6">
      <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto">
        <div
          className={`s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-py-8 ${
            !hasAnyContent || allSectionsCollapsed ? "s-flex-1" : ""
          }`}
        >
          {hasAnyContent && !allSectionsCollapsed ? (
            <>
              <h2 className="s-heading-2xl s-mb-4 s-text-foreground dark:s-text-foreground-night">
                Inbox
              </h2>
              <div className="s-flex s-flex-col">
                {/* My Conversations Section */}
                {myConversations.length > 0 && (
                  <Collapsible
                    key="my-conversations"
                    open={!collapsedSpaces.has("my-conversations")}
                    onOpenChange={(open) => {
                      if (!open) {
                        setCollapsedSpaces((prev) =>
                          new Set(prev).add("my-conversations")
                        );
                      } else {
                        setCollapsedSpaces((prev) => {
                          const next = new Set(prev);
                          next.delete("my-conversations");
                          return next;
                        });
                      }
                    }}
                    className="s-flex s-flex-col"
                  >
                    <CollapsibleContent>
                      <div className="s-flex s-flex-col">
                        <ListItemSection
                          size="sm"
                          action={
                            <Button
                              label="Mark as read"
                              icon={CheckIcon}
                              size="xs"
                              variant="ghost-secondary"
                              onClick={toggleMyConversationsCollapse}
                            />
                          }
                        >
                          My conversations
                        </ListItemSection>
                        <ListGroup>
                          {myConversations.map((conversation) => {
                            const participants = getRandomParticipants(
                              conversation,
                              users,
                              agents
                            );
                            const creator = getRandomCreator(
                              conversation,
                              users
                            );
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

                            // Generate random counts respecting mentionCount <= unreadCount <= replyCount
                            const replyCount = Math.floor(
                              Math.random() * 8 + 1
                            );
                            const messageCount = Math.floor(
                              Math.random() * replyCount + 1
                            );
                            const mentionCount = Math.floor(
                              Math.random() * (messageCount + 1)
                            );

                            return (
                              <ConversationListItem
                                key={conversation.id}
                                conversation={conversation}
                                creator={creator || undefined}
                                time={time}
                                replySection={
                                  <ReplySection
                                    replyCount={replyCount}
                                    unreadCount={messageCount}
                                    mentionCount={mentionCount}
                                    avatars={avatarProps}
                                    lastMessageBy={
                                      avatarProps[0]?.name || "Unknown"
                                    }
                                  />
                                }
                                onClick={() => {
                                  onConversationClick?.(conversation);
                                }}
                              />
                            );
                          })}
                        </ListGroup>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                {spacesWithUnread.map((space) => {
                  const spaceConversations =
                    conversationsBySpace.get(space.id) || [];
                  if (spaceConversations.length === 0) return null;

                  const isCollapsed = collapsedSpaces.has(space.id);

                  return (
                    <Collapsible
                      key={space.id}
                      open={!isCollapsed}
                      onOpenChange={(open) => {
                        if (!open) {
                          setCollapsedSpaces((prev) =>
                            new Set(prev).add(space.id)
                          );
                        } else {
                          setCollapsedSpaces((prev) => {
                            const next = new Set(prev);
                            next.delete(space.id);
                            return next;
                          });
                        }
                      }}
                      className="s-flex s-flex-col"
                    >
                      <CollapsibleContent>
                        <div className="s-flex s-flex-col">
                          <ListItemSection
                            size="sm"
                            onClick={() => onSpaceClick?.(space)}
                            action={
                              <Button
                                label="Mark as read"
                                icon={CheckIcon}
                                size="xs"
                                variant="ghost-secondary"
                                onClick={() => toggleSpaceCollapse(space.id)}
                              />
                            }
                          >
                            {space.name}
                          </ListItemSection>
                          <ListGroup>
                            {spaceConversations.map((conversation) => {
                              const participants = getRandomParticipants(
                                conversation,
                                users,
                                agents
                              );
                              const creator = getRandomCreator(
                                conversation,
                                users
                              );
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

                              // Generate random counts respecting mentionCount <= unreadCount <= replyCount
                              const replyCount = Math.floor(
                                Math.random() * 8 + 1
                              );
                              const messageCount = Math.floor(
                                Math.random() * replyCount + 1
                              );
                              const mentionCount = Math.floor(
                                Math.random() * (messageCount + 1)
                              );

                              return (
                                <ConversationListItem
                                  key={conversation.id}
                                  conversation={conversation}
                                  creator={creator || undefined}
                                  time={time}
                                  replySection={
                                    <ReplySection
                                      replyCount={replyCount}
                                      unreadCount={messageCount}
                                      mentionCount={mentionCount}
                                      avatars={avatarProps}
                                      lastMessageBy={
                                        avatarProps[0]?.name || "Unknown"
                                      }
                                    />
                                  }
                                  onClick={() => {
                                    onConversationClick?.(conversation);
                                  }}
                                />
                              );
                            })}
                          </ListGroup>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-gap-2">
                <div className="s-flex s-flex-col s-items-center s-justify-center s-gap-0 s-text-foreground dark:s-text-foreground-night">
                  <Icon size="md" visual={InboxIcon} />
                  <h2 className="s-text-2xl">Inbox</h2>
                </div>
                <p className="s-text-center s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
                  You're all caught up!
                  <br />
                  Nothing new under the sun.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
