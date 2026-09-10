import { Avatar, ConversationListItem } from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";

import {
  getBeneficiary,
  getRequestIcon,
  getResolverLabel,
  REQUEST_OUTCOME_LABELS,
  REQUEST_TYPE_LABELS,
} from "../data/requests";
import type { AdminRequest } from "../data/types";
import { getUserById } from "../data/users";
import { AvatarCounter } from "./AvatarCounter";

export function formatCompactAge(date: Date): string {
  const minutes = Math.round((Date.now() - date.getTime()) / (60 * 1000));
  if (minutes < 60) {
    return `${Math.max(1, minutes)}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

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

/** "Pierre Martin on behalf of Elena García" when someone asks for another. */
function getRequesterLine(request: AdminRequest): string | undefined {
  const requester = getUserById(request.requesterId);
  if (!requester) {
    return undefined;
  }
  const beneficiary = getBeneficiary(request);
  return beneficiary
    ? `${requester.fullName} on behalf of ${beneficiary.fullName}`
    : requester.fullName;
}

// The title line carries the request type and the people involved, so the
// description says what is being asked for — not why. The target is dropped
// when it would only repeat itself: a person is already named in the title
// line, as requester or as beneficiary, and most titles name their own target.
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
  onClick?: () => void;
}

/**
 * A request as a list row: the requester's avatar badged with the request type,
 * the type and the people involved on the title line, what is being asked for
 * below, and — once decided — who decided and how.
 */
export function RequestListItem({
  request,
  isHistory = false,
  isSelected = false,
  currentUserId,
  onClick,
}: RequestListItemProps) {
  const requester = getUserById(request.requesterId);
  const isPending = request.status === "pending";
  const date = getRowDate(request, isHistory);

  return (
    <ConversationListItem
      conversation={{
        id: request.id,
        title: REQUEST_TYPE_LABELS[request.type],
        description: getRequestDescription(request),
        updatedAt: date,
      }}
      creator={
        requester
          ? {
              fullName: getRequesterLine(request) ?? requester.fullName,
              portrait: requester.portrait,
            }
          : undefined
      }
      leadingVisual={
        requester ? (
          <AvatarCounter
            size="sm"
            isRounded
            name={requester.fullName}
            visual={requester.portrait}
            badgeIcon={getRequestIcon(request)}
            badgeLabel={REQUEST_TYPE_LABELS[request.type]}
            // Money is the one category worth spotting before reading the row.
            variant={request.type === "creditManagement" ? "info" : "primary"}
          />
        ) : undefined
      }
      unread={isPending}
      time={isHistory ? formatShortDate(date) : formatCompactAge(date)}
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
