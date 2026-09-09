import {
  Avatar,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  ClipboardCheck,
  ConversationListItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  ListGroup,
  ListItemSection,
  SearchInput,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type ComponentType,
  Fragment,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import {
  getBeneficiary,
  getRequestIcon,
  getRequestTypeIcon,
  getResolverLabel,
  REQUEST_OUTCOME_LABELS,
  REQUEST_TYPE_LABELS,
} from "../data/requests";
import type { AdminRequest, RequestType } from "../data/types";
import { getUserById } from "../data/users";
import { EmptyState } from "./EmptyState";

/** A request is "done"; the tab that lists the done ones is History. */
export type RequestsTab = "pending" | "history";

interface RequestsViewProps {
  requests: AdminRequest[];
  activeTab: RequestsTab;
  onTabChange?: (tab: RequestsTab) => void;
  /**
   * Requests handled during this visit. They keep their place in Pending —
   * showing their outcome — until the view is refreshed.
   */
  stickyRequestIds?: Set<string>;
  onClearHandled?: () => void;
  currentUserId?: string;
  selectedRequestId?: string | null;
  onRequestClick?: (request: AdminRequest) => void;
}

type DateBucketKey = "Today" | "Yesterday" | "Last Week" | "Last Month";

const DATE_BUCKET_ORDER: DateBucketKey[] = [
  "Today",
  "Yesterday",
  "Last Week",
  "Last Month",
];

const ANY = "all";

function formatCompactAge(date: Date): string {
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

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Same buckets as the pod conversation list.
function getDateBucket(date: Date): DateBucketKey {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (day.getTime() >= today.getTime()) {
    return "Today";
  }
  if (day.getTime() >= yesterday.getTime()) {
    return "Yesterday";
  }
  if (day.getTime() >= lastWeek.getTime()) {
    return "Last Week";
  }
  return "Last Month";
}

/**
 * Pending is ordered by when a request was asked, History by when it was
 * decided. Using it for the row's timestamp, its bucket and the sort keeps a
 * request that is handled in place from jumping to another day.
 */
function getRowDate(request: AdminRequest, isHistory: boolean): Date {
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

/**
 * The requests queue. "Pending" is the shared work list — anyone eligible can
 * pick a row up — and "History" is the audit trail of who decided what, and
 * when.
 */
export function RequestsView({
  requests,
  activeTab,
  onTabChange,
  stickyRequestIds,
  onClearHandled,
  currentUserId,
  selectedRequestId = null,
  onRequestClick,
}: RequestsViewProps) {
  const [searchText, setSearchText] = useState("");
  const [typeFilter, setTypeFilter] = useState<RequestType | typeof ANY>(ANY);
  const [requesterFilter, setRequesterFilter] = useState<string>(ANY);
  const [resolverFilter, setResolverFilter] = useState<string>(ANY);

  const isHistory = activeTab === "history";

  // A tab switch is also the refresh that flushes the sticky rows, so start it
  // from a clean slate rather than carrying the other tab's filters over.
  // Reset during render, not in an effect, so the incoming tab never paints a
  // frame filtered by the outgoing tab's selection.
  const [filtersTab, setFiltersTab] = useState<RequestsTab>(activeTab);
  if (filtersTab !== activeTab) {
    setFiltersTab(activeTab);
    setSearchText("");
    setTypeFilter(ANY);
    setRequesterFilter(ANY);
    setResolverFilter(ANY);
  }

  const tabRequests = useMemo(
    () =>
      requests.filter((request) =>
        isHistory
          ? request.status === "done"
          : request.status === "pending" || stickyRequestIds?.has(request.id)
      ),
    [requests, isHistory, stickyRequestIds]
  );

  const handledRowCount = useMemo(
    () => tabRequests.filter((request) => request.status === "done").length,
    [tabRequests]
  );

  const typeOptions = useMemo(() => {
    const present = new Set(tabRequests.map((request) => request.type));
    return [...present].sort((a, b) =>
      REQUEST_TYPE_LABELS[a].localeCompare(REQUEST_TYPE_LABELS[b])
    );
  }, [tabRequests]);

  const requesterOptions = useMemo(
    () => collectUsers(tabRequests.map((request) => request.requesterId)),
    [tabRequests]
  );

  const resolverOptions = useMemo(
    () => collectUsers(tabRequests.map((request) => request.resolvedByUserId)),
    [tabRequests]
  );

  const filteredRequests = useMemo(() => {
    const trimmed = searchText.trim().toLowerCase();

    const matching = tabRequests.filter((request) => {
      if (typeFilter !== ANY && request.type !== typeFilter) {
        return false;
      }
      if (requesterFilter !== ANY && request.requesterId !== requesterFilter) {
        return false;
      }
      if (
        resolverFilter !== ANY &&
        request.resolvedByUserId !== resolverFilter
      ) {
        return false;
      }
      if (!trimmed) {
        return true;
      }
      const requester = getUserById(request.requesterId);
      const haystack = [
        request.title,
        request.target.label,
        REQUEST_TYPE_LABELS[request.type],
        requester?.fullName ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(trimmed);
    });

    return [...matching].sort(
      (a, b) =>
        getRowDate(b, isHistory).getTime() - getRowDate(a, isHistory).getTime()
    );
  }, [
    tabRequests,
    searchText,
    typeFilter,
    requesterFilter,
    resolverFilter,
    isHistory,
  ]);

  const bucketedRequests = useMemo(() => {
    const buckets = new Map<DateBucketKey, AdminRequest[]>();
    for (const request of filteredRequests) {
      const bucket = getDateBucket(getRowDate(request, isHistory));
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), request]);
    }
    return buckets;
  }, [filteredRequests, isHistory]);

  const renderRequestItem = (request: AdminRequest) => {
    const requester = getUserById(request.requesterId);
    const isPending = request.status === "pending";
    const isSelected = selectedRequestId === request.id;
    const date = getRowDate(request, isHistory);

    return (
      <ConversationListItem
        key={request.id}
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
        titleIcon={getRequestIcon(request)}
        unread={isPending}
        time={isHistory ? formatShortDate(date) : formatCompactAge(date)}
        className={cn(
          "px-3 rounded-2xl border-transparent!",
          isSelected && "bg-highlight-50"
        )}
        replySection={
          isPending ? undefined : (
            <ResolutionSection
              request={request}
              currentUserId={currentUserId}
            />
          )
        }
        onClick={() => onRequestClick?.(request)}
      />
    );
  };

  const renderToolbar = () => (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <ButtonsSwitchList
          value={activeTab}
          size="sm"
          onValueChange={(value) => {
            if (value === "pending" || value === "history") {
              onTabChange?.(value);
            }
          }}
        >
          <ButtonsSwitch
            value="pending"
            label="Pending"
            tooltip="Requests waiting for a decision."
          />
          <ButtonsSwitch
            value="history"
            label="History"
            tooltip="Requests that have been handled."
          />
        </ButtonsSwitchList>

        <FilterDropdown
          prefix="Type"
          anyLabel="All"
          value={typeFilter}
          selectedLabel={
            typeFilter === ANY ? undefined : REQUEST_TYPE_LABELS[typeFilter]
          }
          onValueChange={(value) =>
            setTypeFilter(value === ANY ? ANY : (value as RequestType))
          }
          options={typeOptions.map((type) => ({
            value: type,
            label: REQUEST_TYPE_LABELS[type],
            icon: getRequestTypeIcon(type),
          }))}
        />

        {!isHistory && handledRowCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            label="Clear handled"
            tooltip="Remove the requests you just handled from Pending."
            onClick={onClearHandled}
          />
        )}

        {isHistory && (
          <>
            <FilterDropdown
              prefix="Requested by"
              anyLabel="Anyone"
              value={requesterFilter}
              selectedLabel={
                requesterFilter === ANY
                  ? undefined
                  : getUserById(requesterFilter)?.fullName
              }
              onValueChange={setRequesterFilter}
              options={requesterOptions}
            />
            <FilterDropdown
              prefix="Handled by"
              anyLabel="Anyone"
              value={resolverFilter}
              selectedLabel={
                resolverFilter === ANY
                  ? undefined
                  : getUserById(resolverFilter)?.fullName
              }
              onValueChange={setResolverFilter}
              options={resolverOptions}
            />
          </>
        )}
      </div>

      <div className="min-w-[16rem] flex-1">
        <SearchInput
          name="requests-search"
          value={searchText}
          onChange={setSearchText}
          placeholder="Search requests..."
        />
      </div>
    </div>
  );

  const renderContent = () => {
    if (tabRequests.length === 0) {
      return (
        <EmptyState
          icon={ClipboardCheck}
          title={isHistory ? "Nothing handled yet" : "No pending requests"}
          description={
            isHistory
              ? "Requests you approve or deny show up here, with who decided and when."
              : "You're all caught up. New requests land here."
          }
        />
      );
    }

    if (filteredRequests.length === 0) {
      return (
        <>
          {renderToolbar()}
          <div className="flex flex-1 items-center justify-center">
            <p className="text-center text-lg text-muted-foreground">
              No requests match your filters.
            </p>
          </div>
        </>
      );
    }

    return (
      <>
        {renderToolbar()}
        <div className="flex flex-col">
          {DATE_BUCKET_ORDER.map((bucketKey) => {
            const bucketRequests = bucketedRequests.get(bucketKey);
            if (!bucketRequests?.length) {
              return null;
            }

            return (
              <Fragment key={bucketKey}>
                <ListItemSection className="pl-3">{bucketKey}</ListItemSection>
                <ListGroup className="border-transparent! gap-0.5">
                  {bucketRequests.map(renderRequestItem)}
                </ListGroup>
              </Fragment>
            );
          })}
        </div>
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

interface FilterOption {
  value: string;
  label: string;
  icon?: ComponentType<{ className?: string }> | ReactNode;
}

function FilterDropdown({
  prefix,
  anyLabel,
  value,
  selectedLabel,
  options,
  onValueChange,
}: {
  prefix: string;
  /** Label of the catch-all option, e.g. "All" or "Anyone". */
  anyLabel: string;
  value: string;
  selectedLabel?: string;
  options: FilterOption[];
  onValueChange: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          label={`${prefix}: ${selectedLabel ?? anyLabel}`}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel label={prefix} />
        <DropdownMenuRadioGroup value={value} onValueChange={onValueChange}>
          <DropdownMenuRadioItem value={ANY} label={anyLabel} />
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              label={option.label}
              icon={option.icon}
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Dedupe a list of user ids into filter options, sorted by name. */
function collectUsers(ids: (string | undefined)[]): FilterOption[] {
  const seen = new Set<string>();
  const options: FilterOption[] = [];

  for (const id of ids) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    const user = getUserById(id);
    if (!user) {
      continue;
    }
    options.push({
      value: id,
      label: user.fullName,
      icon: (
        <Avatar
          name={user.fullName}
          visual={user.portrait}
          size="xs"
          isRounded
        />
      ),
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
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
