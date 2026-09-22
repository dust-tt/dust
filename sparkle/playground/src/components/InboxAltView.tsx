import {
  Button,
  Check,
  CheckDouble,
  Circle,
  Clock,
  Cube01,
  CubeOutline,
  Dot,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ListGroup,
  ListItemSection,
  MessageChatSquare,
  MessageQuestionCircle,
  PauseFill,
  Robot,
  SearchInput,
  Spinner,
  User01,
  Zap,
  Umbrella03,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type ComponentType,
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AGENT_ACTION_TICK_MS,
  getAgentAction,
  getPendingAction,
} from "../data/agentActions";
import { getAgentById } from "../data/agents";
import { getLastSpeaker } from "../data/conversations";
import {
  getThinkingDurationMs,
  type InboxComposition,
  planInboxComposition,
} from "../data/inboxComposition";
import { isTriggeredConversation } from "../data/myPod";
import { REQUEST_TYPE_LABELS } from "../data/requests";
import { getConversationBadge, INBOX_ROW_BADGES } from "../data/rowBadges";
import {
  type DateBucket,
  DATE_BUCKET_ORDER,
  formatRowTime,
  getDateBucket,
  READ_DWELL_MS,
} from "../data/time";
import { getTriggerById } from "../data/triggers";
import type {
  AdminRequest,
  Conversation,
  ConversationWorkState,
  Space,
  Trigger,
} from "../data/types";
import { getUserById } from "../data/users";
import { buildConversationRowMenuItems } from "./conversationRowMenu";
import { Counter } from "./Counter";
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
import {
  ConversationListItem,
  type ConversationListItemProps,
} from "./ConversationListItem";

/** How far back the feed reaches. */
const ROW_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a conversation came from. A run is automated wherever it lands, so it
 * carries the pod it ran in rather than being one or the other.
 */
type RowSource =
  | { kind: "personal" }
  | { kind: "automated"; trigger?: Trigger; space?: Space }
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

/**
 * What a row shows on its right. The three work states come from the
 * conversation; "read" is what is left once nothing is pending on either side.
 */
type RowState = ConversationWorkState | "read";

/**
 * What the Clear menu offers: the rows you are done with, or a whole kind of
 * row at once. Work still in flight is never among them.
 */
const CLEAR_ACTIONS = [
  { id: "read", label: "Clear all read", icon: Check },
  {
    id: "conversations",
    label: "Clear all conversations",
    icon: MessageChatSquare,
  },
  { id: "requests", label: "Clear all requests", icon: MessageQuestionCircle },
  { id: "automated", label: "Clear all automated", icon: Zap },
] as const;

/** The states you can narrow the list to, in the order work moves through. */
const ROW_STATE_OPTIONS: {
  value: RowState;
  label: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "thinking", label: "Thinking", icon: Clock },
  // A row waiting on you is an agent that asked you something.
  { value: "pending", label: "Pending", icon: MessageQuestionCircle },
  { value: "unread", label: "Unread", icon: Dot },
  { value: "read", label: "Read", icon: Check },
];

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
  /** The rows put back to unread from a row's menu, dot and all. */
  unreadRowIds?: Set<string>;
  /** Reports rows as unread, from a row's menu. */
  onRowsUnread?: (rowIds: string[]) => void;
  /** Leaves a conversation, which is the end of it in every list. */
  onLeaveConversation?: (conversationId: string) => void;
  onConversationClick?: (conversation: Conversation) => void;
  onRequestClick?: (request: AdminRequest) => void;
}

/** A restricted pod is drawn with the outlined cube, as in the Inbox. */
function getPodIcon(space: Space) {
  const isRestricted = space.id.charCodeAt(space.id.length - 1) % 2 === 0;
  return isRestricted ? CubeOutline : Cube01;
}

/**
 * Who a row is drawn and named after: whoever spoke last in the conversation,
 * which on work you run with agents is mostly an agent. Agents wear their emoji
 * and members their portrait, the way every other list draws them, and the name
 * beside the title is theirs too, so a row never shows one and says the other.
 */
function getRowSpeakerProps(
  conversation: Conversation
): Pick<ConversationListItemProps, "avatar" | "byline"> {
  const speaker = getLastSpeaker(conversation);
  if (!speaker) {
    return {};
  }

  if (speaker.type === "agent") {
    const agent = getAgentById(speaker.id);
    return agent
      ? {
          avatar: {
            name: agent.name,
            emoji: agent.emoji,
            backgroundColor: agent.backgroundColor,
          },
          byline: agent.name,
        }
      : {};
  }

  const user = getUserById(speaker.id);
  return user
    ? {
        avatar: {
          name: user.fullName,
          visual: user.portrait,
          isRounded: true,
        },
        byline: user.fullName,
      }
    : {};
}

/**
 * Whether a row is still moving — the agent working, or waiting on you. Rows in
 * flight cannot be read away: they stay in the list, indicator and all, until
 * the work behind them stops.
 */
function isInFlight(state: RowState | undefined): boolean {
  return state === "thinking" || state === "pending";
}

/**
 * Where a row stands, once the agent's state and yours are weighed against
 * each other. Work in flight is the agent's business: reading a row cannot
 * stop it, nor make it look finished. Everything else is yours to clear.
 */
function getRowState({
  workState,
  isForcedUnread,
  isRead,
}: {
  workState?: ConversationWorkState;
  isForcedUnread: boolean;
  isRead: boolean;
}): RowState {
  if (workState === "thinking" || workState === "pending") {
    return workState;
  }
  if (isForcedUnread) {
    return "unread";
  }
  return !isRead && workState === "unread" ? "unread" : "read";
}

/**
 * A row's state, in the space the timestamp holds. An agent at work takes that
 * space over — that it is running says more than when it started — while a row
 * waiting on you, or done and unread, keeps the time and adds a counter.
 */
function RowStateIndicator({
  state,
  time,
  unreadCount,
}: {
  state: RowState;
  time: string;
  /** What the row would count if it were unread; unset if it never could be. */
  unreadCount?: number;
}) {
  if (state === "thinking") {
    return <Spinner size="xs" />;
  }

  return (
    <div className="flex items-center">
      <span className="font-normal">{time}</span>
      {state === "pending" && (
        <Counter
          className="ml-2"
          variant="info"
          icon={PauseFill}
          aria-label="Waiting for you"
        />
      )}
      {/* Reading a row does not take its counter away: the counter collapses on
          itself, so the row settles instead of blinking. */}
      {unreadCount !== undefined && (
        <Counter
          className="ml-2"
          variant="highlight"
          value={unreadCount}
          isCollapsed={state !== "unread"}
          aria-label={unreadCount > 1 ? `${unreadCount} unread` : "Unread"}
        />
      )}
    </div>
  );
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

/**
 * How a conversation row opens its description: the pod it happened in, since
 * that is what the row leaves open. Work of your own places itself, and so does
 * a run outside a pod — the bolt on its avatar has already said what it is.
 */
function getConversationDescriptionPrefix(
  source: RowSource
): string | undefined {
  const space = source.kind === "personal" ? undefined : source.space;
  return space ? `In ${space.name}` : undefined;
}

/**
 * How long the Inbox has been open, which is the only clock the list needs:
 * the working rows read their action off it, and each of them comes back with
 * an answer once its own stretch of work has run out. One interval drives the
 * whole list, and it stops as soon as the last agent is done, so an Inbox with
 * nothing in flight ticks nothing.
 */
function useElapsedWhileWorking(thinkingRowIds: string[]): number {
  const [openedAt] = useState(() => Date.now());
  const [elapsedMs, setElapsedMs] = useState(0);

  const lastAnswerAt = useMemo(
    () => Math.max(0, ...thinkingRowIds.map(getThinkingDurationMs)),
    [thinkingRowIds]
  );
  const isAnyRowWorking = elapsedMs < lastAnswerAt;

  useEffect(() => {
    if (!isAnyRowWorking) {
      return;
    }

    const interval = setInterval(
      () => setElapsedMs(Date.now() - openedAt),
      AGENT_ACTION_TICK_MS
    );
    return () => clearInterval(interval);
  }, [isAnyRowWorking, openedAt]);

  return elapsedMs;
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
  unreadRowIds,
  onRowsUnread,
  onLeaveConversation,
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
  const [hiddenRowIds, setHiddenRowIds] = useState(() => new Set(readRowIds));

  const spacesById = useMemo(
    () => new Map(spaces.map((space) => [space.id, space])),
    [spaces]
  );
  // The Inbox is planned once and then kept: a list that reshuffles its states
  // whenever anything else changes is not a list you can work through.
  const planRef = useRef<InboxComposition | null>(null);

  const { rows, composition } = useMemo(() => {
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
              space,
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

    const listed = [...conversationRows, ...requestRows].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    );

    // How much of each state the Inbox holds is planned over the rows it can
    // actually list, which is why it happens here and not where the mock
    // conversations are drawn: a pod you are not in takes its rows with it.
    // Leaving a conversation replans what is left, so the plan in hand goes
    // back in: the rows that stayed keep what they had, and only the gap they
    // left is filled.
    const previous = planRef.current;
    const composition = planInboxComposition(
      listed.map((row) => ({
        id: row.id,
        kind: row.kind,
        // A conversation with its thread written out has already shown you
        // whether its agent is still typing, so the plan works around it.
        fixedState:
          previous?.states.get(row.id) ??
          (row.kind === "conversation" && row.conversation.messages
            ? row.conversation.workState
            : undefined),
        fixedUnreadCount:
          previous?.unreadCounts.get(row.id) ??
          (row.kind === "conversation"
            ? row.conversation.unreadCount
            : undefined),
        hasAgentSpeaker:
          row.kind === "conversation" &&
          getLastSpeaker(row.conversation)?.type === "agent",
      })),
      previous?.visibleRequestIds
    );
    planRef.current = composition;

    return {
      // The queue holds more requests than a morning's worth; the Inbox takes
      // the recent ones and leaves the rest to the Requests page.
      rows: listed.filter(
        (row) =>
          row.kind !== "request" || composition.visibleRequestIds.has(row.id)
      ),
      composition,
    };
  }, [conversations, requests, spacesById, triggers]);

  const thinkingRowIds = useMemo(
    () =>
      [...composition.states]
        .filter(([, state]) => state === "thinking")
        .map(([id]) => id),
    [composition]
  );
  const elapsedMs = useElapsedWhileWorking(thinkingRowIds);

  /**
   * Where every row stands, in one place, so the list filters, clears and
   * draws rows by the same reading of them. An agent that has run out of work
   * to do comes back with an answer: the row stops spinning and turns unread
   * under you, which is what an Inbox left open on a second screen does.
   */
  const rowStates = useMemo(() => {
    const states = new Map<string, RowState>();

    for (const row of rows) {
      if (row.kind === "request") {
        states.set(row.id, readRowIds?.has(row.id) ? "read" : "unread");
        continue;
      }

      const planned = composition.states.get(row.id);
      const workState =
        planned === "thinking" && elapsedMs >= getThinkingDurationMs(row.id)
          ? "unread"
          : planned;
      const isForcedUnread = unreadRowIds?.has(row.id) ?? false;

      states.set(
        row.id,
        getRowState({
          workState,
          isForcedUnread,
          isRead: !isForcedUnread && (readRowIds?.has(row.id) ?? false),
        })
      );
    }

    return states;
  }, [composition, elapsedMs, readRowIds, rows, unreadRowIds]);

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

    const presentStates = new Set(rowStates.values());

    return [
      {
        kind: "type",
        label: "Type",
        icon: MessageQuestionCircle,
        options: typeOptions,
      },
      {
        kind: "status",
        label: "Status",
        icon: Circle,
        options: ROW_STATE_OPTIONS.filter((option) =>
          presentStates.has(option.value)
        ),
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
  }, [rows, rowStates, spaces]);

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return (
      rows
        .filter((row) => {
          if (!isInFlight(rowStates.get(row.id)) && hiddenRowIds.has(row.id)) {
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
                : filter.kind === "status"
                  ? rowStates.get(row.id) === filter.value
                  : filter.kind === "agent"
                    ? getRowAgentIds(row).includes(filter.value)
                    : getRowPeopleIds(row).includes(filter.value);
            if (!matchesFilter) {
              return false;
            }
          }
          return !query || getRowSearchText(row).includes(query);
        })
        // An agent at work is what you came to watch, so it does not wait its
        // turn in the chronology: work in flight leads, and the rest of the list
        // stays newest first behind it.
        .sort(
          (a, b) =>
            Number(rowStates.get(b.id) === "thinking") -
              Number(rowStates.get(a.id) === "thinking") ||
            b.date.getTime() - a.date.getTime()
        )
    );
  }, [
    filter,
    hiddenRowIds,
    hideRequests,
    hideTriggered,
    rows,
    rowStates,
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
  // Both sets are asked about the row rather than watched: an agent at work
  // rebuilds them every time its action line ticks over, and a dependency that
  // changes every 600ms restarts a three-second timer for as long as the agent
  // keeps working.
  const isSelectedRowListed = selectedRowId
    ? visibleRowIds.has(selectedRowId)
    : false;
  const isSelectedRowRead = selectedRowId
    ? (readRowIds?.has(selectedRowId) ?? false)
    : false;

  useEffect(() => {
    if (!selectedRowId || !isSelectedRowListed || isSelectedRowRead) {
      return;
    }

    const timeout = setTimeout(
      () => onRowsRead?.([selectedRowId]),
      READ_DWELL_MS
    );
    return () => clearTimeout(timeout);
  }, [isSelectedRowListed, isSelectedRowRead, onRowsRead, selectedRowId]);

  // Clearing is reading in bulk: the rows go now, and stay gone on the next
  // visit because they leave as read. Work still in flight is not yours to
  // clear, however long you spent looking at it.
  const clearable = useMemo(() => {
    const takeable = visibleRows.filter(
      (row) => !isInFlight(rowStates.get(row.id))
    );
    const conversations = takeable.filter((row) => row.kind === "conversation");

    return {
      read: takeable
        .filter((row) => rowStates.get(row.id) === "read")
        .map((row) => row.id),
      conversations: conversations
        .filter(
          (row) =>
            row.kind === "conversation" && row.source.kind !== "automated"
        )
        .map((row) => row.id),
      requests: takeable
        .filter((row) => row.kind === "request")
        .map((row) => row.id),
      automated: conversations
        .filter(
          (row) =>
            row.kind === "conversation" && row.source.kind === "automated"
        )
        .map((row) => row.id),
    };
  }, [rowStates, visibleRows]);

  const clear = useCallback(
    (rowIds: string[]) => {
      if (rowIds.length === 0) {
        return;
      }
      onRowsRead?.(rowIds);
      setHiddenRowIds((prev) => new Set([...prev, ...rowIds]));
    },
    [onRowsRead]
  );

  // Anything still listed is something left to deal with, whichever kind it is.
  const isCaughtUp = useMemo(
    () =>
      rows.every(
        (row) => !isInFlight(rowStates.get(row.id)) && hiddenRowIds.has(row.id)
      ),
    [hiddenRowIds, rows, rowStates]
  );

  const bucketedRows = useMemo(() => {
    const buckets = new Map<DateBucket, InboxAltRow[]>();
    for (const row of visibleRows) {
      const bucket = getDateBucket(row.date);
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), row]);
    }
    return buckets;
  }, [visibleRows]);

  const renderRow = (row: InboxAltRow) => {
    if (row.kind === "request") {
      return (
        <RequestListItem
          key={row.id}
          request={row.request}
          isSelected={selectedRequestId === row.id}
          currentUserId={currentUserId}
          // What kind of work this is opens the description line rather than
          // sitting in a chip: it reads as the sentence it belongs to.
          descriptionPrefix="Request"
          badge={INBOX_ROW_BADGES.request}
          isRead={readRowIds?.has(row.id) ?? false}
          onClick={() => onRequestClick?.(row.request)}
        />
      );
    }

    const trigger =
      row.source.kind === "automated" ? row.source.trigger : undefined;
    const state = rowStates.get(row.id) ?? "read";
    // A row you put back to unread by hand has nothing to count, so it counts
    // as one. A row the plan never gave a count to has never been unread, and
    // so has no counter to collapse when you read it.
    const unreadCount = unreadRowIds?.has(row.id)
      ? (composition.unreadCounts.get(row.id) ?? 1)
      : composition.unreadCounts.get(row.id);
    // Something is still moving in the conversation, by the agent or waiting on
    // you, so whoever is in it breathes.
    const isBusy = isInFlight(state);
    // A row still moving has nothing to summarise yet: the description is the
    // last thing that happened, and something is happening now. So it reports
    // the step instead — the one being taken, or the one being waited on, tool
    // and all — and keeps the pod that places it.
    const action =
      state === "thinking"
        ? getAgentAction(row.id, Math.floor(elapsedMs / AGENT_ACTION_TICK_MS))
        : state === "pending"
          ? getPendingAction(row.id)
          : undefined;

    return (
      <ConversationListItem
        key={row.id}
        conversation={{
          ...row.conversation,
          description: action?.label ?? row.conversation.description,
        }}
        {...getRowSpeakerProps(row.conversation)}
        badge={getConversationBadge(row.conversation)}
        leadingVisual={
          trigger ? (
            <TriggerRunAvatar trigger={trigger} busy={isBusy} />
          ) : undefined
        }
        busy={isBusy}
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          selectedConversationId === row.id && "bg-highlight-50"
        )}
        // The state carries the row now, counter and all, so the dot that used
        // to follow the timestamp has nothing left to say.
        unread={false}
        descriptionPrefix={getConversationDescriptionPrefix(row.source)}
        descriptionIcon={action?.icon}
        trailing={
          <RowStateIndicator
            state={state}
            time={formatRowTime(row.date)}
            unreadCount={unreadCount}
          />
        }
        menuItems={buildConversationRowMenuItems({
          isUnread: state === "unread",
          onMarkRead: () => onRowsRead?.([row.id]),
          onMarkUnread: () => onRowsUnread?.([row.id]),
          onClear: isBusy ? undefined : () => clear([row.id]),
          onLeave: () => onLeaveConversation?.(row.id),
        })}
        onClick={() => onConversationClick?.(row.conversation)}
      />
    );
  };

  const renderContent = () => {
    // Nothing left to search or filter through, so the toolbar goes too. A
    // filter matching nothing keeps it, and says so below.
    if (isCaughtUp) {
      return (
        <EmptyState
          icon={Umbrella03}
          title="You're all caught up"
          description="Nothing new under the sun."
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  icon={CheckDouble}
                  size="sm"
                  variant="outline"
                  tooltip="Clear rows out of the Inbox."
                  isSelect
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {CLEAR_ACTIONS.map(({ id, label, icon }) => (
                  <DropdownMenuItem
                    key={id}
                    label={label}
                    icon={icon}
                    disabled={clearable[id].length === 0}
                    onClick={() => clear(clearable[id])}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
