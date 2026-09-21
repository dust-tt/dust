import { Avatar } from "@dust-tt/sparkle";

import { ConversationListItem } from "./ConversationListItem";
import { cn } from "@sparkle/lib/utils";
import type { ReactNode } from "react";

import {
  getResolverLabel,
  REQUEST_OUTCOME_LABELS,
  REQUEST_TYPE_LABELS,
} from "../data/requests";
import {
  getRequestTypeBadge,
  ROW_BADGE_VARIANT,
  type RowBadge,
} from "../data/rowBadges";
import { formatRowTime } from "../data/time";
import type { AdminRequest } from "../data/types";
import { getUserById } from "../data/users";
import { AvatarCounter } from "./AvatarCounter";
import { Counter } from "./Counter";

/**
 * Pending is ordered by when a request was asked, History by when it was
 * decided. Using it for the row's timestamp, its bucket and the sort keeps a
 * request that is handled in place from jumping to another day.
 */
export function getRowDate(request: AdminRequest, isHistory: boolean): Date {
  return isHistory
    ? (request.resolvedAt ?? request.createdAt)
    : request.createdAt;
}

// The title line carries the request type and who asked, so the description
// says what is being asked for — not why. The target is dropped when it would
// only repeat itself: a person is already named by the title, as requester or
// as beneficiary, and most titles name their own target.
function getRequestDescription(request: AdminRequest): string {
  const { kind, label } = request.target;
  const isRedundant =
    kind === "user" ||
    request.title.toLowerCase().includes(label.toLowerCase());

  return isRedundant ? request.title : `${request.title} — ${label}`;
}

/** Who decided and how, in the shape of the pod ReplySection. */
function ResolutionSection({
  request,
  currentUserId,
}: {
  request: AdminRequest;
  currentUserId?: string;
}) {
  const resolver = request.resolvedByUserId
    ? getUserById(request.resolvedByUserId)
    : undefined;

  if (!resolver || !request.outcome) {
    return null;
  }

  const resolverLabel = getResolverLabel(request, currentUserId);

  return (
    <div className="flex items-center gap-2 pt-2">
      <Avatar
        name={resolver.fullName}
        visual={resolver.portrait}
        size="xs"
        isRounded
      />
      <div className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        <span
          className={cn(
            "heading-xs",
            request.outcome === "approved"
              ? "text-emerald-700 dark:text-emerald-300"
              : "text-warning-700"
          )}
        >
          {REQUEST_OUTCOME_LABELS[request.outcome]}
        </span>{" "}
        by <span className="heading-xs">{resolverLabel}</span>
        {/* What the admin did, for the types they act on rather than wave through. */}
        {request.outcome === "approved" && request.resolutionMessage
          ? ` — ${request.resolutionMessage}`
          : ""}
      </div>
    </div>
  );
}

interface RequestListItemProps {
  request: AdminRequest;
  /** History rows are stamped with the decision date and carry its author. */
  isHistory?: boolean;
  isSelected?: boolean;
  currentUserId?: string;
  /**
   * Opens the description, for a list holding requests among other work. A
   * list of nothing but requests leaves it: every row there is one already.
   */
  descriptionPrefix?: ReactNode;
  /**
   * What the avatar wears. A list holding requests among other work says so
   * here; a list of nothing but requests leaves it, and the row says which
   * kind of request it is instead.
   */
  badge?: RowBadge;
  /** A request you have read folds its counter away, as a conversation does. */
  isRead?: boolean;
  onClick?: () => void;
}

/**
 * A request as a list row: the requester's avatar badged with the request's
 * type, or with whatever the list it sits in asks for, the type and the
 * requester's name on the title line, what is being asked for below, and —
 * once decided — who decided and how.
 */
export function RequestListItem({
  request,
  isHistory = false,
  isSelected = false,
  currentUserId,
  descriptionPrefix,
  badge = getRequestTypeBadge(request),
  isRead = false,
  onClick,
}: RequestListItemProps) {
  const requester = getUserById(request.requesterId);
  const isPending = request.status === "pending";
  // A request that has been decided has nothing left to read: whatever it
  // became, you find it in History rather than in what is waiting for you.
  const isUnread = isPending && !isRead;
  const date = getRowDate(request, isHistory);

  return (
    <ConversationListItem
      conversation={{
        id: request.id,
        title: REQUEST_TYPE_LABELS[request.type],
        description: getRequestDescription(request),
        updatedAt: date,
      }}
      // The row names the person who asked and stops there: who they asked for
      // is the detail view's business, and too long to sit beside the title.
      creator={
        requester
          ? { fullName: requester.fullName, portrait: requester.portrait }
          : undefined
      }
      leadingVisual={
        requester ? (
          <AvatarCounter
            size="sm"
            isRounded
            name={requester.fullName}
            visual={requester.portrait}
            badgeIcon={badge.icon}
            badgeLabel={badge.label}
            variant={ROW_BADGE_VARIANT}
          />
        ) : undefined
      }
      // A request says it is unread with a counter rather than the dot that
      // used to follow the timestamp, so the row's own dot stays off.
      unread={false}
      descriptionPrefix={descriptionPrefix}
      trailing={
        <div className="flex items-center">
          <span className="font-normal">{formatRowTime(date)}</span>
          {/* The counter marks a request you have not read, and has nothing to
              count, so it carries no value. Reading folds it away rather than
              dropping it, so the row settles instead of blinking. */}
          <Counter
            className="ml-2"
            variant="highlight"
            isCollapsed={!isUnread}
            aria-label="Unread"
          />
        </div>
      }
      className={cn(
        "px-3 rounded-2xl border-transparent!",
        isSelected && "bg-highlight-50"
      )}
      replySection={
        isPending ? undefined : (
          <ResolutionSection request={request} currentUserId={currentUserId} />
        )
      }
      onClick={onClick}
    />
  );
}
