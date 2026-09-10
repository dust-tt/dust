import {
  Avatar,
  Button,
  Check,
  ClipboardCheck,
  Collapsible,
  CollapsibleContent,
  ConversationListItem,
  Cube01,
  CubeOutline,
  Icon,
  Inbox01,
  ListGroup,
  MessageChatSquare,
  ReplySection,
  SearchInputWithPopover,
  UniversalSearchItem,
  Zap,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import { useEffect, useMemo, useState, type ComponentType } from "react";

import { getAgentById } from "../data/agents";
import { getRandomInboxGreetingForName } from "../data/greetings";
import { isTriggeredConversation } from "../data/myPod";
import type {
  AdminRequest,
  Agent,
  Conversation,
  Space,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { EmptyState } from "./EmptyState";
import { RequestListItem } from "./RequestListItem";

type InboxConversationSearchItem = {
  type: "conversation";
  conversation: Conversation;
  creator?: User;
  title: string;
  description: string;
  score: number;
};

interface InboxViewProps {
  spaces: Space[];
  conversations: Conversation[];
  users: User[];
  agents: Agent[];
  /** The requests queue; only the pending ones surface here. */
  requests?: AdminRequest[];
  selectedConversationId?: string | null;
  selectedRequestId?: string | null;
  currentUserId?: string;
  onConversationClick?: (conversation: Conversation) => void;
  onRequestClick?: (request: AdminRequest) => void;
  onMyPodClick?: () => void;
  onAutomationsClick?: () => void;
  onSpaceClick?: (space: Space) => void;
  /** Opens the full requests queue from the section header. */
  onRequestsClick?: () => void;
  personalSectionLabel?: string;
}

function buildInboxConversationSearchResults(
  conversations: Conversation[],
  searchText: string,
  users: User[]
): InboxConversationSearchItem[] {
  const trimmed = searchText.trim();
  if (!trimmed) {
    return [];
  }

  const searchLower = trimmed.toLowerCase();

  return conversations
    .reduce<InboxConversationSearchItem[]>((acc, conversation) => {
      const creator = getRandomCreator(conversation, users);
      const title = conversation.title;
      const description = conversation.description ?? "";
      const searchableTitle = creator ? `${creator.fullName} ${title}` : title;
      const titleMatch = searchableTitle.toLowerCase().includes(searchLower);
      const descriptionMatch = description.toLowerCase().includes(searchLower);

      if (titleMatch || descriptionMatch) {
        acc.push({
          type: "conversation",
          conversation,
          creator: creator || undefined,
          title,
          description,
          score: titleMatch ? 2 : 1,
        });
      }

      return acc;
    }, [])
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.title.localeCompare(b.title);
    });
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
    }

    const agent = participant.data as Agent;
    return {
      name: agent.name,
      emoji: agent.emoji,
      backgroundColor: agent.backgroundColor,
      isRounded: false,
    };
  });
}

function getConversationListItemMeta(conversation: Conversation) {
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

  return { time, replyCount, messageCount, mentionCount };
}

function getInboxPodSectionIcon(space: Space) {
  const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
  return isRestricted ? CubeOutline : Cube01;
}

export function InboxView({
  spaces,
  conversations,
  users,
  agents,
  requests,
  selectedConversationId = null,
  selectedRequestId = null,
  currentUserId,
  onConversationClick,
  onRequestClick,
  onMyPodClick,
  onAutomationsClick,
  onSpaceClick,
  onRequestsClick,
  personalSectionLabel = "My Pod",
}: InboxViewProps) {
  const currentUserFirstName = currentUserId
    ? (getUserById(currentUserId)?.firstName ?? "there")
    : "there";
  const [greeting, setGreeting] = useState<string>("");
  useEffect(() => {
    setGreeting(getRandomInboxGreetingForName(currentUserFirstName));
  }, [currentUserFirstName]);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(
    new Set()
  );
  const [conversationSearchText, setConversationSearchText] = useState("");
  const [isConversationSearchOpen, setIsConversationSearchOpen] =
    useState(false);

  const toggleSectionCollapse = (sectionKey: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  };

  const myConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const filtered = conversations.filter((conv) => {
      if (isTriggeredConversation(conv)) {
        return false;
      }
      if (conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    });

    const sorted = [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const limit = Math.min(
      Math.max(1, Math.floor(Math.random() * 3) + 1),
      sorted.length
    );
    return sorted.slice(0, limit);
  }, [conversations]);

  const automationConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const filtered = conversations.filter((conv) => {
      if (!isTriggeredConversation(conv)) {
        return false;
      }
      return conv.updatedAt >= twoDaysAgo;
    });

    const sorted = [...filtered].sort(
      (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
    );
    const limit = Math.min(
      Math.max(1, Math.floor(Math.random() * 3) + 1),
      sorted.length
    );
    return sorted.slice(0, limit);
  }, [conversations]);

  const unreadConversations = useMemo(() => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    return conversations.filter((conv) => {
      if (isTriggeredConversation(conv)) {
        return false;
      }
      if (!conv.spaceId) return false;
      return conv.updatedAt >= twoDaysAgo;
    });
  }, [conversations]);

  const inboxSearchableConversations = useMemo(
    () => [
      ...myConversations,
      ...automationConversations,
      ...unreadConversations,
    ],
    [automationConversations, myConversations, unreadConversations]
  );

  const conversationSearchResults = useMemo(
    () =>
      buildInboxConversationSearchResults(
        inboxSearchableConversations,
        conversationSearchText,
        users
      ),
    [conversationSearchText, inboxSearchableConversations, users]
  );

  const conversationsBySpace = useMemo(() => {
    const grouped = new Map<string, Conversation[]>();

    unreadConversations.forEach((conv) => {
      if (conv.spaceId) {
        const existing = grouped.get(conv.spaceId) || [];
        existing.push(conv);
        grouped.set(conv.spaceId, existing);
      }
    });

    const result = new Map<string, Conversation[]>();
    grouped.forEach((convs, spaceId) => {
      const sorted = [...convs].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      const limit = Math.min(
        Math.max(1, Math.floor(Math.random() * 4) + 1),
        sorted.length
      );
      result.set(spaceId, sorted.slice(0, limit));
    });

    return result;
  }, [unreadConversations]);

  const spacesWithUnread = useMemo(() => {
    return spaces.filter((space) => conversationsBySpace.has(space.id));
  }, [spaces, conversationsBySpace]);

  // Stabilize the random per-conversation display data (participants, creator,
  // reply/message/mention counts) so unrelated re-renders don't reshuffle the
  // lists. Recomputed only when the displayed conversations change.
  const conversationDisplayById = useMemo(() => {
    const map = new Map<
      string,
      {
        creator?: User;
        avatarProps: ReturnType<typeof participantsToAvatarProps>;
        time: string;
        replyCount: number;
        messageCount: number;
        mentionCount: number;
      }
    >();

    const displayed = [
      ...myConversations,
      ...automationConversations,
      ...Array.from(conversationsBySpace.values()).flat(),
    ];

    displayed.forEach((conversation) => {
      if (map.has(conversation.id)) {
        return;
      }
      const participants = getRandomParticipants(conversation, users, agents);
      const creator = getRandomCreator(conversation, users);
      const meta = getConversationListItemMeta(conversation);
      map.set(conversation.id, {
        creator: creator || undefined,
        avatarProps: participantsToAvatarProps(participants),
        ...meta,
      });
    });

    return map;
  }, [
    automationConversations,
    myConversations,
    conversationsBySpace,
    users,
    agents,
  ]);

  // A request leaves the Inbox the moment it is handled: nothing pins it here
  // the way the requests queue pins the rows you just decided.
  const pendingRequests = useMemo(
    () =>
      [...(requests ?? [])]
        .filter((request) => request.status === "pending")
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [requests]
  );

  const hasConversationContent =
    myConversations.length > 0 ||
    automationConversations.length > 0 ||
    spacesWithUnread.length > 0 ||
    pendingRequests.length > 0;

  const allConversationSectionsCollapsed = useMemo(() => {
    if (!hasConversationContent) return true;

    // Requests are out of reach of "Mark as read", so they keep the Inbox from
    // ever reading as empty.
    if (pendingRequests.length > 0) return false;

    const myConversationsCollapsed =
      myConversations.length === 0 || collapsedSections.has("my-conversations");

    const automationsCollapsed =
      automationConversations.length === 0 ||
      collapsedSections.has("automations");

    const allSpacesCollapsed =
      spacesWithUnread.length === 0 ||
      spacesWithUnread.every((space) => collapsedSections.has(space.id));

    return (
      myConversationsCollapsed && automationsCollapsed && allSpacesCollapsed
    );
  }, [
    automationConversations.length,
    collapsedSections,
    hasConversationContent,
    myConversations.length,
    pendingRequests.length,
    spacesWithUnread,
  ]);

  const handleConversationSearchSelect = (
    item: InboxConversationSearchItem
  ) => {
    onConversationClick?.(item.conversation);
    setIsConversationSearchOpen(false);
  };

  const renderConversationSearchItem = (
    item: InboxConversationSearchItem,
    selected: boolean
  ) => {
    const description = item.description || "No description available.";
    const visual = item.creator ? (
      <Avatar
        name={item.creator.fullName}
        visual={item.creator.portrait}
        size="xs"
        isRounded={true}
      />
    ) : null;
    const title = item.creator ? (
      <>
        <span className="shrink-0">{item.creator.fullName}</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {item.title}
        </span>
      </>
    ) : (
      <span className="min-w-0 truncate">{item.title}</span>
    );

    return (
      <UniversalSearchItem
        key={item.conversation.id}
        onClick={() => handleConversationSearchSelect(item)}
        selected={selected}
        hasSeparator={false}
        visual={visual}
        title={title}
        description={description}
      />
    );
  };

  const handleMarkAllConversationsAsRead = () => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.add("my-conversations");
      next.add("automations");
      spacesWithUnread.forEach((space) => next.add(space.id));
      return next;
    });
  };

  const renderConversationsToolbar = () => (
    <div className="flex items-center gap-2">
      <SearchInputWithPopover
        name="inbox-conversation-search"
        value={conversationSearchText}
        onChange={(value) => {
          setConversationSearchText(value);
          if (!value.trim()) {
            setIsConversationSearchOpen(false);
          }
        }}
        open={isConversationSearchOpen}
        onOpenChange={setIsConversationSearchOpen}
        placeholder="Search in Inbox"
        className="w-full"
        items={conversationSearchResults}
        availableHeight
        noResults={
          conversationSearchText.trim()
            ? "No results found"
            : "Start typing to search"
        }
        onItemSelect={handleConversationSearchSelect}
        renderItem={(item, selected) =>
          renderConversationSearchItem(item, selected)
        }
      />
      <Button
        label="Mark all as read"
        icon={Check}
        size="sm"
        variant="outline"
        tooltip="Mark all as read"
        onClick={handleMarkAllConversationsAsRead}
      />
    </div>
  );

  const renderInboxSectionHeader = ({
    label,
    icon,
    onHeaderClick,
    action,
  }: {
    label: string;
    icon?: ComponentType<{ className?: string }>;
    onHeaderClick?: () => void;
    /** Sections nothing can mark as read — requests — leave this out. */
    action?: { label: string; onAction: () => void };
  }) => (
    <div
      // The 44px floor is the height the action button gives a header, held
      // here so the sections without one stand just as tall.
      className="mt-2 flex min-h-11 cursor-pointer items-center justify-between rounded-2xl bg-muted-background p-1.5 pl-3.5 heading-sm"
      onClick={onHeaderClick}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {icon ? <Icon visual={icon} size="sm" /> : null}
        {label}
      </span>
      {action && (
        <Button
          label={action.label}
          icon={Check}
          size="sm"
          variant="ghost-secondary"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            action.onAction();
          }}
        />
      )}
    </div>
  );

  const renderInboxConversationItem = (conversation: Conversation) => {
    const display = conversationDisplayById.get(conversation.id);
    const creator = display?.creator;
    const avatarProps = display?.avatarProps ?? [];
    const time = display?.time ?? "";
    const replyCount = display?.replyCount ?? 0;
    const messageCount = display?.messageCount ?? 0;
    const mentionCount = display?.mentionCount ?? 0;
    const isSelected = selectedConversationId === conversation.id;

    return (
      <ConversationListItem
        key={conversation.id}
        conversation={conversation}
        creator={creator || undefined}
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          isSelected && "bg-highlight-50"
        )}
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
        onClick={() => {
          onConversationClick?.(conversation);
        }}
      />
    );
  };

  const renderEmptyState = (title: string, description: React.ReactNode) => (
    <EmptyState icon={Inbox01} title={title} description={description} />
  );

  // Nothing left to read, whether the Inbox came in empty or was just cleared.
  // It then has nothing to search, mark as read, or greet you about either, so
  // the empty state gets the panel to itself.
  const isEmpty = !hasConversationContent || allConversationSectionsCollapsed;

  const renderConversationsTab = () => {
    if (isEmpty) {
      return renderEmptyState(
        "Inbox",
        <>
          You're all caught up!
          <br />
          Nothing new under the sun.
        </>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {renderConversationsToolbar()}
        <div className="flex flex-col">
          {myConversations.length > 0 && (
            <Collapsible
              key="my-conversations"
              open={!collapsedSections.has("my-conversations")}
              onOpenChange={(open) => {
                if (!open) {
                  setCollapsedSections((prev) =>
                    new Set(prev).add("my-conversations")
                  );
                } else {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete("my-conversations");
                    return next;
                  });
                }
              }}
              className="flex flex-col"
            >
              <CollapsibleContent>
                <div className="flex flex-col gap-1">
                  {renderInboxSectionHeader({
                    label: personalSectionLabel,
                    icon: MessageChatSquare,
                    onHeaderClick: onMyPodClick,
                    action: {
                      label: "Mark as read",
                      onAction: () => toggleSectionCollapse("my-conversations"),
                    },
                  })}
                  <ListGroup className="border-transparent! gap-0.5">
                    {myConversations.map(renderInboxConversationItem)}
                  </ListGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {automationConversations.length > 0 && (
            <Collapsible
              key="automations"
              open={!collapsedSections.has("automations")}
              onOpenChange={(open) => {
                if (!open) {
                  setCollapsedSections((prev) =>
                    new Set(prev).add("automations")
                  );
                } else {
                  setCollapsedSections((prev) => {
                    const next = new Set(prev);
                    next.delete("automations");
                    return next;
                  });
                }
              }}
              className="flex flex-col"
            >
              <CollapsibleContent>
                <div className="flex flex-col gap-1">
                  {renderInboxSectionHeader({
                    label: "Automated work",
                    icon: Zap,
                    onHeaderClick: onAutomationsClick,
                    action: {
                      label: "Mark as read",
                      onAction: () => toggleSectionCollapse("automations"),
                    },
                  })}
                  <ListGroup className="border-transparent! gap-0.5">
                    {automationConversations.map(renderInboxConversationItem)}
                  </ListGroup>
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}
          {spacesWithUnread.map((space) => {
            const spaceConversations = conversationsBySpace.get(space.id) || [];
            if (spaceConversations.length === 0) return null;

            return (
              <Collapsible
                key={space.id}
                open={!collapsedSections.has(space.id)}
                onOpenChange={(open) => {
                  if (!open) {
                    setCollapsedSections((prev) => new Set(prev).add(space.id));
                  } else {
                    setCollapsedSections((prev) => {
                      const next = new Set(prev);
                      next.delete(space.id);
                      return next;
                    });
                  }
                }}
                className="flex flex-col"
              >
                <CollapsibleContent>
                  <div className="flex flex-col gap-1">
                    {renderInboxSectionHeader({
                      label: space.name,
                      icon: getInboxPodSectionIcon(space),
                      onHeaderClick: () => onSpaceClick?.(space),
                      action: {
                        label: "Mark as read",
                        onAction: () => toggleSectionCollapse(space.id),
                      },
                    })}
                    <ListGroup className="border-transparent! gap-0.5">
                      {spaceConversations.map(renderInboxConversationItem)}
                    </ListGroup>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
          {pendingRequests.length > 0 && (
            <div className="flex flex-col gap-1">
              {renderInboxSectionHeader({
                label: "Requests",
                icon: ClipboardCheck,
                onHeaderClick: onRequestsClick,
              })}
              <ListGroup className="border-transparent! gap-0.5">
                {pendingRequests.map((request) => (
                  <RequestListItem
                    key={request.id}
                    request={request}
                    isSelected={selectedRequestId === request.id}
                    currentUserId={currentUserId}
                    onClick={() => onRequestClick?.(request)}
                  />
                ))}
              </ListGroup>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      {/* flex-1 so an empty state, which grows to fill its parent, centers on
          the panel rather than collapsing under the greeting. */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pt-8 pb-8">
        {greeting && !isEmpty && (
          <div className="heading-2xl text-center text-foreground">
            {greeting}
          </div>
        )}
        {renderConversationsTab()}
      </div>
    </div>
  );
}
