import {
  Bell01,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CheckDouble,
  ListGroup,
  ListItemSection,
  MessageQuestionCircle,
  User01,
} from "@dust-tt/sparkle";
import { Fragment, useMemo, useState } from "react";

import { getRequestTypeIcon, REQUEST_TYPE_LABELS } from "../data/requests";
import {
  type DateBucket,
  DATE_BUCKET_ORDER,
  getDateBucket,
} from "../data/time";
import type { AdminRequest } from "../data/types";
import { EmptyState } from "./EmptyState";
import { collectUsers, FilterMenu, type FilterSelection } from "./FilterMenu";
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
  const [filter, setFilter] = useState<FilterSelection>(null);

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
    const buckets = new Map<DateBucket, AdminRequest[]>();
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

      <div className="ml-auto flex items-center gap-2">
        {!isHistory && handledRowCount > 0 && (
          <Button
            size="sm"
            variant="outline"
            icon={CheckDouble}
            label="Clear handled"
            tooltip="Remove the requests you just handled from Pending."
            onClick={onClearHandled}
          />
        )}

        <FilterMenu
          filter={filter}
          groups={[
            {
              kind: "type",
              label: "Request",
              icon: Bell01,
              options: typeOptions.map((type) => ({
                value: type,
                label: REQUEST_TYPE_LABELS[type],
                icon: getRequestTypeIcon(type),
              })),
            },
            {
              kind: "member",
              label: "Member",
              icon: User01,
              options: memberOptions,
            },
          ]}
          onFilterChange={setFilter}
          searchName="request-filter-search"
          searchPlaceholder="Filter by request or member"
        />
      </div>
    </div>
  );

  const renderContent = () => {
    if (tabRequests.length === 0) {
      return (
        <EmptyState
          icon={MessageQuestionCircle}
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
