import {
  Avatar,
  Bell01,
  Button,
  Check,
  CheckDouble,
  Cube01,
  CubeOutline,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Icon,
  ListGroup,
  MessageChatSquare,
  MessageQuestionCircle,
  ReplySection,
  Robot,
  SearchInputWithPopover,
  UniversalSearchItem,
  User01,
  Zap,
  Umbrella03,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { getAgentById } from "../data/agents";
import { isTriggeredConversation } from "../data/myPod";
import { getRequestTypeIcon, REQUEST_TYPE_LABELS } from "../data/requests";
import { formatRowTime, READ_DWELL_MS } from "../data/time";
import { getTriggerById } from "../data/triggers";
import type {
  AdminRequest,
  Agent,
  Conversation,
  Space,
  Trigger,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
import { buildConversationRowMenuItems } from "./conversationRowMenu";
import { EmptyState } from "./EmptyState";
import {
  collectAgents,
  collectUsers,
  FilterMenu,
  type FilterGroup,
  type FilterSelection,
} from "./FilterMenu";
import { RequestListItem } from "./RequestListItem";
import { TriggerRunAvatar } from "./TriggerRunAvatar";
import { ConversationListItem } from "./ConversationListItem";

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
  /** The triggers behind the automated work rows, which name their agent and type. */
  triggers?: Trigger[];
  selectedConversationId?: string | null;
  selectedRequestId?: string | null;
  /** The rows already read — conversations and requests — which lose their
   * unread state here. */
  readRowIds?: Set<string>;
  /** Reports rows as read, either by dwelling on one or by clearing. */
  onRowsRead?: (rowIds: string[]) => void;
  /** The rows put back to unread from a row's menu, dot and all. */
  unreadRowIds?: Set<string>;
  /** Reports rows as unread, from a row's menu. */
  onRowsUnread?: (rowIds: string[]) => void;
  /** Leaves a conversation, which is the end of it in every list. */
  onLeaveConversation?: (conversationId: string) => void;
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
  const time = formatRowTime(conversation.updatedAt);

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
  triggers,
  selectedConversationId = null,
  selectedRequestId = null,
  readRowIds,
  onRowsRead,
  unreadRowIds,
  onRowsUnread,
  onLeaveConversation,
  currentUserId,
  onConversationClick,
  onRequestClick,
  onMyPodClick,
  onAutomationsClick,
  onSpaceClick,
  onRequestsClick,
  personalSectionLabel = "My Pod",
}: InboxViewProps) {
  // Read before this visit means dealt with, so those rows are gone. What gets
  // read during the visit keeps its place rather than vanishing under the
  // cursor, which is why the snapshot is taken once, on arrival.
  const [hiddenConversationIds, setHiddenConversationIds] = useState(
    () => new Set(readRowIds)
  );
  const [conversationSearchText, setConversationSearchText] = useState("");
  const [isConversationSearchOpen, setIsConversationSearchOpen] =
    useState(false);
  const [filter, setFilter] = useState<FilterSelection>(null);

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

  // Filtering a conversation by request type, or by an agent for a request,
  // matches nothing, so those sections drop out on their own.
  const matchesConversationFilter = useCallback(
    (conversation: Conversation) => {
      if (!filter) {
        return true;
      }
      if (filter.kind === "member") {
        return conversation.userParticipants.includes(filter.value);
      }
      if (filter.kind === "agent") {
        return conversation.agentParticipants.includes(filter.value);
      }
      return false;
    },
    [filter]
  );

  const matchesRequestFilter = useCallback(
    (request: AdminRequest) => {
      if (!filter) {
        return true;
      }
      if (filter.kind === "member") {
        return (
          request.requesterId === filter.value ||
          request.resolvedByUserId === filter.value
        );
      }
      if (filter.kind === "type") {
        return request.type === filter.value;
      }
      return false;
    },
    [filter]
  );

  // Cleared rows and the filter are applied here rather than inside the memos
  // above: those draw their rows at random, so re-running them on every clear
  // or filter change would reshuffle what is left.
  const visibleMyConversations = useMemo(
    () =>
      myConversations.filter(
        (conversation) =>
          !hiddenConversationIds.has(conversation.id) &&
          matchesConversationFilter(conversation)
      ),
    [myConversations, hiddenConversationIds, matchesConversationFilter]
  );

  const visibleAutomationConversations = useMemo(
    () =>
      automationConversations.filter(
        (conversation) =>
          !hiddenConversationIds.has(conversation.id) &&
          matchesConversationFilter(conversation)
      ),
    [automationConversations, hiddenConversationIds, matchesConversationFilter]
  );

  const visibleConversationsBySpace = useMemo(() => {
    const result = new Map<string, Conversation[]>();
    conversationsBySpace.forEach((spaceConversations, spaceId) => {
      const visible = spaceConversations.filter(
        (conversation) =>
          !hiddenConversationIds.has(conversation.id) &&
          matchesConversationFilter(conversation)
      );
      if (visible.length > 0) {
        result.set(spaceId, visible);
      }
    });
    return result;
  }, [conversationsBySpace, hiddenConversationIds, matchesConversationFilter]);

  const spacesWithConversations = useMemo(
    () => spaces.filter((space) => visibleConversationsBySpace.has(space.id)),
    [spaces, visibleConversationsBySpace]
  );

  const visibleConversations = useMemo(
    () => [
      ...visibleMyConversations,
      ...visibleAutomationConversations,
      ...Array.from(visibleConversationsBySpace.values()).flat(),
    ],
    [
      visibleAutomationConversations,
      visibleConversationsBySpace,
      visibleMyConversations,
    ]
  );

  // Clearing is reading in bulk: the rows go now, and stay gone on the next
  // visit because they leave as read.
  const clearConversations = useCallback(
    (conversationIds: string[]) => {
      if (conversationIds.length === 0) {
        return;
      }
      onRowsRead?.(conversationIds);
      setHiddenConversationIds(
        (prev) => new Set([...prev, ...conversationIds])
      );
    },
    [onRowsRead]
  );

  // Stabilize the random per-conversation display data (participants, creator,
  // reply/message/mention counts) so unrelated re-renders — or leaving another
  // conversation — don't reshuffle the lists. Cached by id, computed once.
  const conversationDisplayCacheRef = useRef(
    new Map<
      string,
      {
        creator?: User;
        avatarProps: ReturnType<typeof participantsToAvatarProps>;
        time: string;
        replyCount: number;
        messageCount: number;
        mentionCount: number;
      }
    >()
  );
  const conversationDisplayById = useMemo(() => {
    const map = conversationDisplayCacheRef.current;

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

  const visibleRequests = useMemo(
    () => pendingRequests.filter(matchesRequestFilter),
    [matchesRequestFilter, pendingRequests]
  );

  const visibleRowIds = useMemo(
    () =>
      new Set([
        ...visibleConversations.map((conversation) => conversation.id),
        ...visibleRequests.map((request) => request.id),
      ]),
    [visibleConversations, visibleRequests]
  );

  // Three seconds on a row is reading it rather than glancing at it, whether it
  // is a conversation or a request. Leaving before then, or hopping to another
  // row, calls it off.
  const selectedRowId = selectedConversationId ?? selectedRequestId;

  useEffect(() => {
    if (
      !selectedRowId ||
      !visibleRowIds.has(selectedRowId) ||
      readRowIds?.has(selectedRowId)
    ) {
      return;
    }

    const timeout = setTimeout(
      () => onRowsRead?.([selectedRowId]),
      READ_DWELL_MS
    );
    return () => clearTimeout(timeout);
  }, [onRowsRead, readRowIds, selectedRowId, visibleRowIds]);

  // Options come from the rows the Inbox holds before the filter narrows them,
  // so a pick never empties the menu it came from.
  const filterGroups = useMemo((): FilterGroup[] => {
    const listedConversations = [
      ...myConversations,
      ...automationConversations,
      ...Array.from(conversationsBySpace.values()).flat(),
    ];

    return [
      {
        kind: "member",
        label: "Member",
        icon: User01,
        options: collectUsers([
          ...listedConversations.flatMap(
            (conversation) => conversation.userParticipants
          ),
          ...pendingRequests.flatMap((request) => [
            request.requesterId,
            request.resolvedByUserId,
          ]),
        ]),
      },
      {
        kind: "agent",
        label: "Agent",
        icon: Robot,
        options: collectAgents(
          listedConversations.flatMap(
            (conversation) => conversation.agentParticipants
          )
        ),
      },
      {
        kind: "type",
        label: "Request",
        icon: Bell01,
        options: Array.from(
          new Set(pendingRequests.map((request) => request.type))
        ).map((type) => ({
          value: type,
          label: REQUEST_TYPE_LABELS[type],
          icon: getRequestTypeIcon(type),
        })),
      },
    ];
  }, [
    automationConversations,
    conversationsBySpace,
    myConversations,
    pendingRequests,
  ]);

  // An Inbox with nothing left in it is caught up; a filter that matches
  // nothing is not, so the two are told apart before the filter applies.
  // Requests are out of reach of clearing, so a queue of them keeps the Inbox
  // from reading as caught up.
  const isCaughtUp = useMemo(
    () =>
      pendingRequests.length === 0 &&
      [
        ...myConversations,
        ...automationConversations,
        ...Array.from(conversationsBySpace.values()).flat(),
      ].every((conversation) => hiddenConversationIds.has(conversation.id)),
    [
      automationConversations,
      conversationsBySpace,
      hiddenConversationIds,
      myConversations,
      pendingRequests,
    ]
  );

  const hasNoMatches =
    visibleConversations.length === 0 && visibleRequests.length === 0;

  const clearableReadIds = useMemo(
    () =>
      visibleConversations
        .filter((conversation) => readRowIds?.has(conversation.id))
        .map((conversation) => conversation.id),
    [readRowIds, visibleConversations]
  );

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
        className="w-full min-w-0 max-w-80"
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
      <FilterMenu
        filter={filter}
        groups={filterGroups}
        onFilterChange={setFilter}
        searchName="inbox-filter-search"
        searchPlaceholder="Filter by member, agent or request"
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {clearableReadIds.length > 0 && (
          <Button
            label="Clear read"
            icon={CheckDouble}
            size="sm"
            variant="outline"
            tooltip="Remove the conversations you have already read."
            onClick={() => clearConversations(clearableReadIds)}
          />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              icon={DotsHorizontal}
              size="sm"
              variant="outline"
              tooltip="Inbox options"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent collisionPadding={8}>
            <DropdownMenuItem
              label="Clear all conversations"
              icon={CheckDouble}
              onClick={() =>
                clearConversations(
                  visibleConversations.map((conversation) => conversation.id)
                )
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
    /** Sections nothing can clear — requests — leave this out. */
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
    // A conversation you have stayed on is read: the row keeps its place until
    // you leave the Inbox, but it stops calling for attention. Putting it back
    // to unread from the row's menu has the last word.
    const isForcedUnread = unreadRowIds?.has(conversation.id) ?? false;
    const isRead =
      !isForcedUnread && (readRowIds?.has(conversation.id) ?? false);

    // A run is an agent working alone, so it wears the agent badged with what
    // made it fire, and nobody in it can have mentioned you.
    const trigger = conversation.triggerId
      ? getTriggerById(triggers ?? [], conversation.triggerId)
      : undefined;

    return (
      <ConversationListItem
        key={conversation.id}
        conversation={conversation}
        creator={creator || undefined}
        leadingVisual={
          trigger ? <TriggerRunAvatar trigger={trigger} /> : undefined
        }
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          isSelected && "bg-highlight-50"
        )}
        time={time}
        unread={isForcedUnread || (!isRead && messageCount > 0)}
        replySection={
          <ReplySection
            replyCount={replyCount}
            unreadCount={isRead ? 0 : messageCount}
            mentionCount={trigger || isRead ? 0 : mentionCount}
            avatars={avatarProps}
            lastMessageBy={avatarProps[0]?.name || "Unknown"}
          />
        }
        menuItems={buildConversationRowMenuItems({
          isUnread: isForcedUnread || (!isRead && messageCount > 0),
          onMarkRead: () => onRowsRead?.([conversation.id]),
          onMarkUnread: () => onRowsUnread?.([conversation.id]),
          onLeave: () => onLeaveConversation?.(conversation.id),
        })}
        onClick={() => {
          onConversationClick?.(conversation);
        }}
      />
    );
  };

  const renderConversationsTab = () => {
    // Nothing to search or filter through, so the toolbar goes too.
    if (isCaughtUp) {
      return (
        <EmptyState
          icon={Umbrella03}
          title="You're all caught up"
          description="Nothing new under the sun."
        />
      );
    }

    if (hasNoMatches) {
      return (
        <div className="flex flex-1 flex-col gap-3">
          {renderConversationsToolbar()}
          <div className="flex flex-1 items-center justify-center">
            <p className="text-center text-lg text-muted-foreground">
              No rows match your filter.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        {renderConversationsToolbar()}
        <div className="flex flex-col">
          {visibleMyConversations.length > 0 && (
            <div className="flex flex-col gap-1">
              {renderInboxSectionHeader({
                label: personalSectionLabel,
                icon: MessageChatSquare,
                onHeaderClick: onMyPodClick,
                action: {
                  label: "Mark as read & clear",
                  onAction: () =>
                    clearConversations(
                      visibleMyConversations.map(
                        (conversation) => conversation.id
                      )
                    ),
                },
              })}
              <ListGroup className="border-transparent! gap-0.5">
                {visibleMyConversations.map(renderInboxConversationItem)}
              </ListGroup>
            </div>
          )}
          {visibleAutomationConversations.length > 0 && (
            <div className="flex flex-col gap-1">
              {renderInboxSectionHeader({
                label: "Automated work",
                icon: Zap,
                onHeaderClick: onAutomationsClick,
                action: {
                  label: "Mark as read & clear",
                  onAction: () =>
                    clearConversations(
                      visibleAutomationConversations.map(
                        (conversation) => conversation.id
                      )
                    ),
                },
              })}
              <ListGroup className="border-transparent! gap-0.5">
                {visibleAutomationConversations.map(
                  renderInboxConversationItem
                )}
              </ListGroup>
            </div>
          )}
          {spacesWithConversations.map((space) => {
            const spaceConversations =
              visibleConversationsBySpace.get(space.id) ?? [];

            return (
              <div className="flex flex-col gap-1" key={space.id}>
                {renderInboxSectionHeader({
                  label: space.name,
                  icon: getInboxPodSectionIcon(space),
                  onHeaderClick: () => onSpaceClick?.(space),
                  action: {
                    label: "Mark as read & clear",
                    onAction: () =>
                      clearConversations(
                        spaceConversations.map(
                          (conversation) => conversation.id
                        )
                      ),
                  },
                })}
                <ListGroup className="border-transparent! gap-0.5">
                  {spaceConversations.map(renderInboxConversationItem)}
                </ListGroup>
              </div>
            );
          })}
          {visibleRequests.length > 0 && (
            <div className="flex flex-col gap-1">
              {renderInboxSectionHeader({
                label: "Requests",
                icon: MessageQuestionCircle,
                onHeaderClick: onRequestsClick,
              })}
              <ListGroup className="border-transparent! gap-0.5">
                {visibleRequests.map((request) => (
                  <RequestListItem
                    key={request.id}
                    request={request}
                    isSelected={selectedRequestId === request.id}
                    currentUserId={currentUserId}
                    isRead={readRowIds?.has(request.id) ?? false}
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
          the panel rather than collapsing against the toolbar. */}
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pt-6 pb-8">
        {renderConversationsTab()}
      </div>
    </div>
  );
}
