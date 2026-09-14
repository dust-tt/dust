import {
  Button,
  CheckDouble,
  Chip,
  ConversationListItem,
  Cube01,
  CubeOutline,
  Inbox01,
  ListGroup,
  ListItemSection,
  MessageChatSquare,
  MessageQuestionCircle,
  ReplySection,
  Robot,
  SearchInput,
  User01,
  Zap,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type ComponentType,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getAgentById } from "../data/agents";
import { isTriggeredConversation } from "../data/myPod";
import { REQUEST_TYPE_LABELS } from "../data/requests";
import {
  type DateBucket,
  DATE_BUCKET_ORDER,
  formatRowTime,
  getDateBucket,
} from "../data/time";
import { getTriggerById } from "../data/triggers";
import type {
  AdminRequest,
  Conversation,
  Space,
  Trigger,
  User,
} from "../data/types";
import { getUserById } from "../data/users";
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

/** How far back the feed reaches. */
const ROW_WINDOW_DAYS = 7;

/** How long a conversation has to stay open before it counts as read. */
const READ_DWELL_MS = 3000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Where a conversation came from, which is what its chip says. */
type RowSource =
  | { kind: "personal" }
  | { kind: "automated"; trigger?: Trigger }
  | { kind: "pod"; space: Space };

type InboxAltRow =
  | {
      id: string;
      date: Date;
      kind: "conversation";
      conversation: Conversation;
      source: RowSource;
    }
  | { id: string; date: Date; kind: "request"; request: AdminRequest };

/** The random stand-ins a conversation row is drawn with, held still. */
interface RowDisplay {
  creator?: User;
  avatars: Array<{
    name: string;
    visual?: string;
    emoji?: string;
    backgroundColor?: string;
    isRounded: boolean;
  }>;
  replyCount: number;
  messageCount: number;
  mentionCount: number;
}

interface InboxAltViewProps {
  spaces: Space[];
  conversations: Conversation[];
  /** The requests queue; only the pending ones surface here. */
  requests?: AdminRequest[];
  /** The triggers behind the automated rows, which name their agent and type. */
  triggers?: Trigger[];
  currentUserId?: string;
  selectedConversationId?: string | null;
  selectedRequestId?: string | null;
  /** The rows already read — conversations and requests — which lose their
   * unread state here. */
  readRowIds?: Set<string>;
  /** Reports rows as read, either by dwelling on one or by clearing. */
  onRowsRead?: (rowIds: string[]) => void;
  onConversationClick?: (conversation: Conversation) => void;
  onRequestClick?: (request: AdminRequest) => void;
}

/** A restricted pod is drawn with the outlined cube, as in the Inbox. */
function getPodIcon(space: Space) {
  const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
  return isRestricted ? CubeOutline : Cube01;
}

function buildRowDisplay(conversation: Conversation): RowDisplay {
  const participants: RowDisplay["avatars"] = [];

  conversation.userParticipants.forEach((userId) => {
    const user = getUserById(userId);
    if (user) {
      participants.push({
        name: user.fullName,
        visual: user.portrait,
        isRounded: true,
      });
    }
  });

  conversation.agentParticipants.forEach((agentId) => {
    const agent = getAgentById(agentId);
    if (agent) {
      participants.push({
        name: agent.name,
        emoji: agent.emoji,
        backgroundColor: agent.backgroundColor,
        isRounded: false,
      });
    }
  });

  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  const avatars = shuffled.slice(
    0,
    Math.min(Math.floor(Math.random() * 6) + 1, shuffled.length)
  );

  const creatorId =
    conversation.userParticipants[
      Math.floor(Math.random() * conversation.userParticipants.length)
    ];
  const replyCount = Math.floor(Math.random() * 8 + 1);
  const messageCount = Math.floor(Math.random() * replyCount + 1);

  return {
    creator: creatorId ? getUserById(creatorId) : undefined,
    avatars,
    replyCount,
    messageCount,
    mentionCount: Math.floor(Math.random() * (messageCount + 1)),
  };
}

/** The filter value a row answers to, which is also what its chip says. */
function getRowTypeValue(row: InboxAltRow): string {
  if (row.kind === "request") {
    return "request";
  }
  return row.source.kind === "pod"
    ? `pod:${row.source.space.id}`
    : row.source.kind;
}

function getRowChip(row: InboxAltRow): {
  label: string;
  icon: ComponentType;
} {
  if (row.kind === "request") {
    return { label: "Request", icon: MessageQuestionCircle };
  }
  if (row.source.kind === "pod") {
    return {
      label: row.source.space.name,
      icon: getPodIcon(row.source.space),
    };
  }
  if (row.source.kind === "automated") {
    return { label: "Automated", icon: Zap };
  }
  return { label: "Conversation", icon: MessageChatSquare };
}

/** Everyone a row can be filtered by: who is in it, or who asked and decided. */
function getRowPeopleIds(row: InboxAltRow): (string | undefined)[] {
  return row.kind === "request"
    ? [row.request.requesterId, row.request.resolvedByUserId]
    : row.conversation.userParticipants;
}

/** The agents in a row, which requests never have. */
function getRowAgentIds(row: InboxAltRow): string[] {
  return row.kind === "request" ? [] : row.conversation.agentParticipants;
}

/** What the search field reads: the row's own words, plus its people. */
function getRowSearchText(row: InboxAltRow): string {
  const people = getRowPeopleIds(row)
    .map((id) => (id ? getUserById(id)?.fullName : undefined))
    .filter(Boolean)
    .join(" ");

  if (row.kind === "request") {
    const { request } = row;
    return [
      REQUEST_TYPE_LABELS[request.type],
      request.title,
      request.target.label,
      people,
    ]
      .join(" ")
      .toLowerCase();
  }

  const agents = row.conversation.agentParticipants
    .map((agentId) => getAgentById(agentId)?.name)
    .filter(Boolean)
    .join(" ");

  return [
    row.conversation.title,
    row.conversation.description ?? "",
    people,
    agents,
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * An alternative to the Inbox: instead of a section per source, everything
 * that moved recently — your conversations, your pods', the runs your triggers
 * fired and the requests waiting on you — lands in one list, newest first,
 * each row saying what it is. Narrow it by typing, or by picking a type or a
 * person.
 */
export function InboxAltView({
  spaces,
  conversations,
  requests,
  triggers,
  currentUserId,
  selectedConversationId = null,
  selectedRequestId = null,
  readRowIds,
  onRowsRead,
  onConversationClick,
  onRequestClick,
}: InboxAltViewProps) {
  const [searchText, setSearchText] = useState("");
  const [filter, setFilter] = useState<FilterSelection>(null);
  const [hideTriggered, setHideTriggered] = useState(false);
  const [hideRequests, setHideRequests] = useState(false);
  // Read before this visit means dealt with, so those rows are gone. What gets
  // read during the visit keeps its place rather than vanishing under the
  // cursor, which is why the snapshot is taken once, on arrival.
  const [hiddenConversationIds, setHiddenConversationIds] = useState(
    () => new Set(readRowIds)
  );

  const spacesById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space])),
    [spaces]
  );

  const rows = useMemo(() => {
    const since = new Date(Date.now() - ROW_WINDOW_DAYS * DAY_MS);

    const conversationRows = conversations
      .filter((conversation) => conversation.updatedAt >= since)
      .map<InboxAltRow | null>((conversation) => {
        const space = conversation.spaceId
          ? spacesById.get(conversation.spaceId)
          : undefined;

        // A pod conversation whose pod is not one of yours has no place in
        // your feed, and nothing to put in its chip.
        if (conversation.spaceId && !space) {
          return null;
        }

        const source: RowSource = isTriggeredConversation(conversation)
          ? {
              kind: "automated",
              trigger: conversation.triggerId
                ? getTriggerById(triggers ?? [], conversation.triggerId)
                : undefined,
            }
          : space
            ? { kind: "pod", space }
            : { kind: "personal" };

        return {
          id: conversation.id,
          date: conversation.updatedAt,
          kind: "conversation",
          conversation,
          source,
        };
      })
      .filter((row): row is InboxAltRow => row !== null);

    const requestRows = (requests ?? [])
      .filter((request) => request.status === "pending")
      .map<InboxAltRow>((request) => ({
        id: request.id,
        date: request.createdAt,
        kind: "request",
        request,
      }));

    return [...conversationRows, ...requestRows].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );
  }, [conversations, requests, spacesById, triggers]);

  // Stabilize the random per-conversation display data so unrelated re-renders
  // — a keystroke in the search field — don't reshuffle the rows under you.
  const displayById = useMemo(() => {
    const map = new Map<string, RowDisplay>();
    rows.forEach((row) => {
      if (row.kind === "conversation" && !map.has(row.id)) {
        map.set(row.id, buildRowDisplay(row.conversation));
      }
    });
    return map;
  }, [rows]);

  const filterGroups = useMemo((): FilterGroup[] => {
    const presentTypes = new Set(rows.map(getRowTypeValue));

    const typeOptions = [
      { value: "personal", label: "Conversation", icon: MessageChatSquare },
      { value: "automated", label: "Automated", icon: Zap },
      { value: "request", label: "Request", icon: MessageQuestionCircle },
      ...spaces.map((space) => ({
        value: `pod:${space.id}`,
        label: space.name,
        icon: getPodIcon(space),
      })),
    ].filter((option) => presentTypes.has(option.value));

    return [
      {
        kind: "type",
        label: "Type",
        icon: MessageQuestionCircle,
        options: typeOptions,
      },
      {
        kind: "person",
        label: "Member",
        icon: User01,
        options: collectUsers(rows.flatMap(getRowPeopleIds)),
      },
      {
        kind: "agent",
        label: "Agent",
        icon: Robot,
        options: collectAgents(rows.flatMap(getRowAgentIds)),
      },
    ];
  }, [rows, spaces]);

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return rows.filter((row) => {
      // Cleared rows are dropped here rather than in the memo above, whose
      // display data is drawn at random: re-running it on every clear would
      // reshuffle what is left.
      if (row.kind === "conversation" && hiddenConversationIds.has(row.id)) {
        return false;
      }
      if (hideRequests && row.kind === "request") {
        return false;
      }
      if (
        hideTriggered &&
        row.kind === "conversation" &&
        row.source.kind === "automated"
      ) {
        return false;
      }
      if (filter) {
        const matchesFilter =
          filter.kind === "type"
            ? getRowTypeValue(row) === filter.value
            : filter.kind === "agent"
              ? getRowAgentIds(row).includes(filter.value)
              : getRowPeopleIds(row).includes(filter.value);
        if (!matchesFilter) {
          return false;
        }
      }
      return !query || getRowSearchText(row).includes(query);
    });
  }, [
    filter,
    hiddenConversationIds,
    hideRequests,
    hideTriggered,
    rows,
    searchText,
  ]);

  const visibleRowIds = useMemo(
    () => new Set(visibleRows.map((row) => row.id)),
    [visibleRows]
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

  // Clearing is reading in bulk: the rows go now, and stay gone on the next
  // visit because they leave as read.
  const clearableReadIds = useMemo(
    () =>
      visibleRows
        .filter((row) => row.kind === "conversation" && readRowIds?.has(row.id))
        .map((row) => row.id),
    [readRowIds, visibleRows]
  );

  const clearRead = useCallback(() => {
    if (clearableReadIds.length === 0) {
      return;
    }
    onRowsRead?.(clearableReadIds);
    setHiddenConversationIds((prev) => new Set([...prev, ...clearableReadIds]));
  }, [clearableReadIds, onRowsRead]);

  const bucketedRows = useMemo(() => {
    const buckets = new Map<DateBucket, InboxAltRow[]>();
    for (const row of visibleRows) {
      const bucket = getDateBucket(row.date);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), row]);
    }
    return buckets;
  }, [visibleRows]);

  const renderLabel = (row: InboxAltRow) => {
    const chip = getRowChip(row);
    // The column the label sits in stretches its children, so the chip needs a
    // row of its own to keep to its content's width.
    return (
      <div className="flex">
        <Chip size="mini" icon={chip.icon} label={chip.label} />
      </div>
    );
  };

  const renderRow = (row: InboxAltRow) => {
    if (row.kind === "request") {
      return (
        <RequestListItem
          key={row.id}
          request={row.request}
          isSelected={selectedRequestId === row.id}
          currentUserId={currentUserId}
          label={renderLabel(row)}
          isRead={readRowIds?.has(row.id) ?? false}
          onClick={() => onRequestClick?.(row.request)}
        />
      );
    }

    const display = displayById.get(row.id);
    const trigger =
      row.source.kind === "automated" ? row.source.trigger : undefined;
    // A conversation you have stayed on is read: the row keeps its place until
    // you leave the page, but it stops calling for attention.
    const isRead = readRowIds?.has(row.id) ?? false;
    const unreadCount = isRead ? 0 : (display?.messageCount ?? 0);

    return (
      <ConversationListItem
        key={row.id}
        conversation={row.conversation}
        creator={display?.creator}
        leadingVisual={
          trigger ? <TriggerRunAvatar trigger={trigger} /> : undefined
        }
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          selectedConversationId === row.id && "bg-highlight-50"
        )}
        unread={unreadCount > 0}
        label={renderLabel(row)}
        time={formatRowTime(row.date)}
        replySection={
          <ReplySection
            replyCount={display?.replyCount ?? 0}
            unreadCount={unreadCount}
            // A run is an agent working alone, so nobody in it can have
            // mentioned you.
            mentionCount={trigger || isRead ? 0 : (display?.mentionCount ?? 0)}
            avatars={display?.avatars ?? []}
            lastMessageBy={display?.avatars[0]?.name ?? "Unknown"}
          />
        }
        onClick={() => onConversationClick?.(row.conversation)}
      />
    );
  };

  const renderContent = () => {
    if (rows.length === 0) {
      return (
        <EmptyState
          icon={Inbox01}
          title="Inbox"
          description={
            <>
              You're all caught up!
              <br />
              Nothing new under the sun.
            </>
          }
        />
      );
    }

    return (
      <>
        <div className="flex items-center gap-2">
          <SearchInput
            name="inbox-alt-search"
            value={searchText}
            onChange={setSearchText}
            placeholder="Search in Inbox"
            className="w-full min-w-0 max-w-80"
          />
          <FilterMenu
            filter={filter}
            groups={filterGroups}
            onFilterChange={setFilter}
            toggles={[
              {
                id: "hide-triggered",
                label: "Hide triggered",
                checked: hideTriggered,
                onChange: setHideTriggered,
              },
              {
                id: "hide-requests",
                label: "Hide requests",
                checked: hideRequests,
                onChange: setHideRequests,
              },
            ]}
            searchName="inbox-alt-filter-search"
            searchPlaceholder="Filter by member, agent or type"
          />
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Button
              label="Clear read"
              icon={CheckDouble}
              size="sm"
              variant="outline"
              tooltip="Remove the conversations you have already read."
              disabled={clearableReadIds.length === 0}
              onClick={clearRead}
            />
          </div>
        </div>
        {visibleRows.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-center text-lg text-muted-foreground">
              No rows match your filters.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {DATE_BUCKET_ORDER.map((bucketKey) => {
              const bucketRows = bucketedRows.get(bucketKey);
              if (!bucketRows?.length) {
                return null;
              }

              return (
                <Fragment key={bucketKey}>
                  <ListItemSection className="pl-3">
                    {bucketKey}
                  </ListItemSection>
                  <ListGroup className="border-transparent! gap-0.5">
                    {bucketRows.map(renderRow)}
                  </ListGroup>
                </Fragment>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-x-clip overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-3 px-4 pt-6 pb-8">
        {renderContent()}
      </div>
    </div>
  );
}
