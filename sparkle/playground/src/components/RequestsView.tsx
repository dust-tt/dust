import {
  Avatar,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CheckDouble,
  ClipboardCheck,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  FilterLines,
  ListGroup,
  ListItemSection,
  XClose,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  type ComponentType,
  Fragment,
  type ReactNode,
  useMemo,
  useState,
} from "react";

import { getRequestTypeIcon, REQUEST_TYPE_LABELS } from "../data/requests";
import type { AdminRequest, RequestType } from "../data/types";
import { getUserById } from "../data/users";
import { EmptyState } from "./EmptyState";
import { getRowDate, RequestListItem } from "./RequestListItem";

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

/**
 * Only one thing is filtered at a time, so the queue holds a single selection
 * rather than a filter per category.
 */
type ActiveFilter =
  | { kind: "type"; value: RequestType }
  | { kind: "member"; value: string }
  | null;

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
  const [filter, setFilter] = useState<ActiveFilter>(null);

  const isHistory = activeTab === "history";

  // A tab switch is also the refresh that flushes the sticky rows, so start it
  // from a clean slate rather than carrying the other tab's filter over.
  // Reset during render, not in an effect, so the incoming tab never paints a
  // frame filtered by the outgoing tab's selection.
  const [filtersTab, setFiltersTab] = useState<RequestsTab>(activeTab);
  if (filtersTab !== activeTab) {
    setFiltersTab(activeTab);
    setFilter(null);
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

  // A member is anyone who took part in a request: they asked for it, or they
  // decided it.
  const memberOptions = useMemo(
    () =>
      collectUsers(
        tabRequests.flatMap((request) => [
          request.requesterId,
          request.resolvedByUserId,
        ])
      ),
    [tabRequests]
  );

  const filteredRequests = useMemo(() => {
    const matching = tabRequests.filter((request) => {
      if (!filter) {
        return true;
      }
      if (filter.kind === "type") {
        return request.type === filter.value;
      }
      return (
        request.requesterId === filter.value ||
        request.resolvedByUserId === filter.value
      );
    });

    return [...matching].sort(
      (a, b) =>
        getRowDate(b, isHistory).getTime() - getRowDate(a, isHistory).getTime()
    );
  }, [tabRequests, filter, isHistory]);

  const bucketedRequests = useMemo(() => {
    const buckets = new Map<DateBucketKey, AdminRequest[]>();
    for (const request of filteredRequests) {
      const bucket = getDateBucket(getRowDate(request, isHistory));
      buckets.set(bucket, [...(buckets.get(bucket) ?? []), request]);
    }
    return buckets;
  }, [filteredRequests, isHistory]);

  const renderRequestItem = (request: AdminRequest) => (
    <RequestListItem
      key={request.id}
      request={request}
      isHistory={isHistory}
      isSelected={selectedRequestId === request.id}
      currentUserId={currentUserId}
      onClick={() => onRequestClick?.(request)}
    />
  );

  const renderToolbar = () => (
    <div className="flex w-full flex-wrap items-center gap-2">
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

      <RequestFilterMenu
        filter={filter}
        typeOptions={typeOptions.map((type) => ({
          value: type,
          label: REQUEST_TYPE_LABELS[type],
          icon: getRequestTypeIcon(type),
        }))}
        memberOptions={memberOptions}
        onFilterChange={setFilter}
      />

      {!isHistory && handledRowCount > 0 && (
        <Button
          size="sm"
          variant="outline"
          icon={CheckDouble}
          label="Clear handled"
          tooltip="Remove the requests you just handled from Pending."
          className="ml-auto"
          onClick={onClearHandled}
        />
      )}
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

/**
 * One filter at a time, picked from one menu: a category to drill into, or a
 * search that reaches across every category at once.
 */
function RequestFilterMenu({
  filter,
  typeOptions,
  memberOptions,
  onFilterChange,
}: {
  filter: ActiveFilter;
  typeOptions: FilterOption[];
  memberOptions: FilterOption[];
  onFilterChange: (filter: ActiveFilter) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const matches = (options: FilterOption[]) =>
    options.filter((option) => option.label.toLowerCase().includes(query));
  const matchingTypes = query ? matches(typeOptions) : [];
  const matchingMembers = query ? matches(memberOptions) : [];

  const activeLabel = filter
    ? (filter.kind === "type" ? typeOptions : memberOptions).find(
        (option) => option.value === filter.value
      )?.label
    : undefined;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSearch("");
    }
  };

  const select = (next: ActiveFilter) => {
    onFilterChange(next);
    handleOpenChange(false);
  };

  const renderOptions = (kind: "type" | "member", options: FilterOption[]) =>
    options.map((option) => (
      <DropdownMenuItem
        key={`${kind}-${option.value}`}
        label={option.label}
        icon={option.icon}
        onClick={() =>
          select(
            kind === "type"
              ? { kind, value: option.value as RequestType }
              : { kind, value: option.value }
          )
        }
      />
    ));

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          icon={FilterLines}
          label={activeLabel ?? "Filter"}
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        // The menu is as tall as what it holds, up to a cap the search scrolls
        // within, rather than the fixed height a header otherwise imposes.
        className="h-auto max-h-96 w-auto min-w-[240px] max-w-[320px] xs:h-auto"
        dropdownHeaders={
          <>
            {filter && (
              <>
                <DropdownMenuItem
                  icon={XClose}
                  label="Clear filtering"
                  onClick={() => select(null)}
                />
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuSearchbar
              autoFocus
              name="request-filter-search"
              placeholder="Filter by type or member"
              value={search}
              onChange={setSearch}
            />
          </>
        }
      >
        {query ? (
          <>
            {matchingTypes.length > 0 && (
              <>
                <DropdownMenuLabel label="Type" />
                {renderOptions("type", matchingTypes)}
              </>
            )}
            {matchingMembers.length > 0 && (
              <>
                <DropdownMenuLabel label="Member" />
                {renderOptions("member", matchingMembers)}
              </>
            )}
            {matchingTypes.length === 0 && matchingMembers.length === 0 && (
              <div className="flex h-16 items-center justify-center px-3 text-sm text-muted-foreground">
                No match
              </div>
            )}
          </>
        ) : (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Type" />
              <DropdownMenuSubContent>
                {renderOptions("type", typeOptions)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger label="Member" />
              <DropdownMenuSubContent>
                {renderOptions("member", memberOptions)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
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
