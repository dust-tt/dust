import {
  Button,
  CheckIcon,
  Collapsible,
  CollapsibleContent,
  ConversationListItem,
  FilterChips,
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

const INBOX_SOURCE_FILTERS = ["all", "projects", "agents", "people"] as const;

type InboxSourceFilter = (typeof INBOX_SOURCE_FILTERS)[number];

interface InboxViewProps {
  spaces: Space[];
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  currentUserId: string;
  onConversationClick?: (conversation: Conversation) => void;
  onSpaceClick?: (space: Space) => void;
  onAgentClick?: (agent: Agent) => void;
  onPersonClick?: (person: User) => void;
}

function getRandomParticipants(
  conversation: Conversation,
  _users: User[],
  _agents: Agent[]
): Array<{ type: "user" | "agent"; data: User | Agent }> {
  const allParticipants: Array<{ type: "user" | "agent"; data: User | Agent }> =
    [];

  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      allParticipants.push({ type: "user", data: user });
    }
  });

  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      allParticipants.push({ type: "agent", data: agent });
    }
  });

  const shuffled = [...allParticipants].sort(() => Math.random() - 0.5);
  const count = Math.min(
    Math.max(1, Math.floor(Math.random() * 6) + 1),
    shuffled.length
  );
  return shuffled.slice(0, count);
}

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

function isUnreadConversation(conv: Conversation): boolean {
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  return conv.updatedAt >= twoDaysAgo;
}

function getCounterpartUserId(
  conv: Conversation,
  currentUserId: string
): string | null {
  const others = conv.userParticipants.filter((id) => id !== currentUserId);
  if (others.length === 0) {
    return null;
  }
  return [...others].sort()[0];
}

function limitConversations(convs: Conversation[]): Conversation[] {
  const sorted = [...convs].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  );
  const limit = Math.min(
    Math.max(1, Math.floor(Math.random() * 4) + 1),
    sorted.length
  );
  return sorted.slice(0, limit);
}

export function InboxView({
  spaces,
  conversations,
  users,
  agents: _agents,
  currentUserId,
  onConversationClick,
  onSpaceClick,
  onAgentClick,
  onPersonClick,
}: InboxViewProps) {
  const [collapsedSpaces, setCollapsedSpaces] = useState<Set<string>>(
    new Set()
  );
  const [sourceFilter, setSourceFilter] = useState<InboxSourceFilter>("all");

  const toggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSpaces((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const unreadInProject = useMemo(() => {
    return conversations.filter(
      (conv) => conv.spaceId && isUnreadConversation(conv)
    );
  }, [conversations]);

  const conversationsBySpace = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();
    unreadInProject.forEach((conv) => {
      if (!conv.spaceId) return;
      const existing = grouped.get(conv.spaceId) || [];
      existing.push(conv);
      grouped.set(conv.spaceId, existing);
    });
    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, spaceId) => {
      result.set(spaceId, limitConversations(convs));
    });
    return result;
  }, [unreadInProject]);

  const spacesWithUnread = useMemo(() => {
    return spaces.filter((space) => conversationsBySpace.has(space.id));
  }, [spaces, conversationsBySpace]);

  const directConversations = useMemo(() => {
    return conversations.filter(
      (conv) => !conv.spaceId && isUnreadConversation(conv)
    );
  }, [conversations]);

  const conversationsByAgent = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();
    directConversations.forEach((conv) => {
      if (conv.agentParticipants.length === 0) return;
      const agentId = [...conv.agentParticipants].sort()[0];
      const existing = grouped.get(agentId) || [];
      existing.push(conv);
      grouped.set(agentId, existing);
    });
    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, agentId) => {
      result.set(agentId, limitConversations(convs));
    });
    return result;
  }, [directConversations]);

  const agentsWithUnread = useMemo(() => {
    const list: { agent: Agent; conversations: Conversation[] }[] = [];
    conversationsByAgent.forEach((convs, agentId) => {
      const agent = getAgentById(agentId);
      if (agent && convs.length > 0) {
        list.push({ agent, conversations: convs });
      }
    });
    return list.sort((a, b) => a.agent.name.localeCompare(b.agent.name));
  }, [conversationsByAgent]);

  const conversationsByPerson = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();
    directConversations.forEach((conv) => {
      if (conv.agentParticipants.length > 0) return;
      const otherId = getCounterpartUserId(conv, currentUserId);
      if (!otherId) return;
      const existing = grouped.get(otherId) || [];
      existing.push(conv);
      grouped.set(otherId, existing);
    });
    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, userId) => {
      result.set(userId, limitConversations(convs));
    });
    return result;
  }, [directConversations, currentUserId]);

  const peopleWithUnread = useMemo(() => {
    const list: { user: User; conversations: Conversation[] }[] = [];
    conversationsByPerson.forEach((convs, userId) => {
      const person = getUserById(userId);
      if (person && convs.length > 0) {
        list.push({ user: person, conversations: convs });
      }
    });
    return list.sort((a, b) => a.user.fullName.localeCompare(b.user.fullName));
  }, [conversationsByPerson]);

  const hasAnyContent =
    spacesWithUnread.length > 0 ||
    agentsWithUnread.length > 0 ||
    peopleWithUnread.length > 0;

  const showProjectSections =
    sourceFilter === "all" || sourceFilter === "projects";
  const showAgentSections = sourceFilter === "all" || sourceFilter === "agents";
  const showPeopleSections =
    sourceFilter === "all" || sourceFilter === "people";

  const hasVisibleContentForFilter =
    (showProjectSections && spacesWithUnread.length > 0) ||
    (showAgentSections && agentsWithUnread.length > 0) ||
    (showPeopleSections && peopleWithUnread.length > 0);

  const allVisibleSectionsCollapsed = useMemo(() => {
    if (!hasVisibleContentForFilter) return true;

    if (showProjectSections && spacesWithUnread.length > 0) {
      const anyOpen = spacesWithUnread.some(
        (space) => !collapsedSpaces.has(space.id)
      );
      if (anyOpen) return false;
    }

    if (showAgentSections && agentsWithUnread.length > 0) {
      const anyOpen = agentsWithUnread.some(
        ({ agent }) => !collapsedSpaces.has(`agent:${agent.id}`)
      );
      if (anyOpen) return false;
    }

    if (showPeopleSections && peopleWithUnread.length > 0) {
      const anyOpen = peopleWithUnread.some(
        ({ user: person }) => !collapsedSpaces.has(`person:${person.id}`)
      );
      if (anyOpen) return false;
    }

    return true;
  }, [
    hasVisibleContentForFilter,
    showProjectSections,
    showAgentSections,
    showPeopleSections,
    spacesWithUnread,
    agentsWithUnread,
    peopleWithUnread,
    collapsedSpaces,
  ]);

  const renderConversationRows = (convs: Conversation[]) =>
    convs.map((conversation) => {
      const participants = getRandomParticipants(conversation, users, _agents);
      const creator = getRandomCreator(conversation, users);
      const avatarProps = participantsToAvatarProps(participants);
      const time = conversation.updatedAt
        .toLocaleTimeString("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace("24:", "00:");
      const replyCount = Math.floor(Math.random() * 8 + 1);
      const messageCount = Math.floor(Math.random() * replyCount + 1);
      const mentionCount = Math.floor(Math.random() * (messageCount + 1));

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
              lastMessageBy={avatarProps[0]?.name || "Unknown"}
            />
          }
          onClick={() => onConversationClick?.(conversation)}
        />
      );
    });

  const showInboxList =
    hasVisibleContentForFilter && !allVisibleSectionsCollapsed;

  const inboxSecondaryMessage = (() => {
    if (!hasAnyContent) return null;
    if (!hasVisibleContentForFilter) {
      return (
        <p className="s-text-center s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
          Nothing in this filter right now.
          <br />
          Try another filter above.
        </p>
      );
    }
    if (allVisibleSectionsCollapsed) {
      return (
        <p className="s-text-center s-text-lg s-text-muted-foreground dark:s-text-muted-foreground-night">
          You're all caught up!
          <br />
          Nothing new under the sun.
        </p>
      );
    }
    return null;
  })();

  return (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background s-px-6">
      <div className="s-flex s-h-full s-min-h-0 s-flex-1 s-flex-col s-overflow-y-auto">
        <div
          className={`s-mx-auto s-flex s-w-full s-max-w-4xl s-flex-col s-py-8 ${
            !hasAnyContent || !showInboxList ? "s-flex-1" : ""
          }`}
        >
          {hasAnyContent ? (
            <>
              <h2 className="s-heading-2xl s-mb-3 s-text-foreground dark:s-text-foreground-night">
                Inbox
              </h2>
              <div className="s-mb-6">
                <FilterChips<InboxSourceFilter>
                  filters={[...INBOX_SOURCE_FILTERS]}
                  selectedFilter={sourceFilter}
                  onFilterClick={(name) => setSourceFilter(name)}
                />
              </div>
              {showInboxList ? (
                <div className="s-flex s-flex-col">
                  {showProjectSections &&
                    spacesWithUnread.map((space) => {
                      const spaceConversations =
                        conversationsBySpace.get(space.id) || [];
                      if (spaceConversations.length === 0) return null;
                      const isCollapsed = collapsedSpaces.has(space.id);
                      return (
                        <Collapsible
                          key={space.id}
                          open={!isCollapsed}
                          onOpenChange={(open) => {
                            setCollapsedSpaces((prev) => {
                              const next = new Set(prev);
                              if (!open) next.add(space.id);
                              else next.delete(space.id);
                              return next;
                            });
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
                                    onClick={() =>
                                      toggleSectionCollapse(space.id)
                                    }
                                  />
                                }
                              >
                                {space.name}
                              </ListItemSection>
                              <ListGroup>
                                {renderConversationRows(spaceConversations)}
                              </ListGroup>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  {showAgentSections &&
                    agentsWithUnread.map(({ agent, conversations: convs }) => {
                      const key = `agent:${agent.id}`;
                      const isCollapsed = collapsedSpaces.has(key);
                      return (
                        <Collapsible
                          key={key}
                          open={!isCollapsed}
                          onOpenChange={(open) => {
                            setCollapsedSpaces((prev) => {
                              const next = new Set(prev);
                              if (!open) next.add(key);
                              else next.delete(key);
                              return next;
                            });
                          }}
                          className="s-flex s-flex-col"
                        >
                          <CollapsibleContent>
                            <div className="s-flex s-flex-col">
                              <ListItemSection
                                size="sm"
                                onClick={() => onAgentClick?.(agent)}
                                action={
                                  <Button
                                    label="Mark as read"
                                    icon={CheckIcon}
                                    size="xs"
                                    variant="ghost-secondary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleSectionCollapse(key);
                                    }}
                                  />
                                }
                              >
                                {agent.name}
                              </ListItemSection>
                              <ListGroup>
                                {renderConversationRows(convs)}
                              </ListGroup>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  {showPeopleSections &&
                    peopleWithUnread.map(
                      ({ user: person, conversations: convs }) => {
                        const key = `person:${person.id}`;
                        const isCollapsed = collapsedSpaces.has(key);
                        return (
                          <Collapsible
                            key={key}
                            open={!isCollapsed}
                            onOpenChange={(open) => {
                              setCollapsedSpaces((prev) => {
                                const next = new Set(prev);
                                if (!open) next.add(key);
                                else next.delete(key);
                                return next;
                              });
                            }}
                            className="s-flex s-flex-col"
                          >
                            <CollapsibleContent>
                              <div className="s-flex s-flex-col">
                                <ListItemSection
                                  size="sm"
                                  onClick={() => onPersonClick?.(person)}
                                  action={
                                    <Button
                                      label="Mark as read"
                                      icon={CheckIcon}
                                      size="xs"
                                      variant="ghost-secondary"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSectionCollapse(key);
                                      }}
                                    />
                                  }
                                >
                                  {person.fullName}
                                </ListItemSection>
                                <ListGroup>
                                  {renderConversationRows(convs)}
                                </ListGroup>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      }
                    )}
                </div>
              ) : (
                <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-gap-2 s-pt-4">
                  {inboxSecondaryMessage}
                </div>
              )}
            </>
          ) : (
            <div className="s-flex s-flex-1 s-flex-col s-items-center s-justify-center s-gap-2">
              <div className="s-flex s-flex-col s-items-center s-justify-center s-gap-0 s-text-foreground dark:s-text-foreground-night">
                <Icon size="md" visual={InboxIcon} />
                <h2 className="s-text-2xl">Inbox</h2>
              </div>
              <p className="s-text-center s-text-lg s-text-muted-foreground dark:s-text-foreground-night">
                You're all caught up!
                <br />
                Nothing new under the sun.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
