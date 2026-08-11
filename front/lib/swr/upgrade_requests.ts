import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type {
  GetUpgradeRequestsResponseBody,
  PatchUpgradeRequestResponseBody,
  UpgradeRequestResolution,
} from "@app/types/api/credits/upgrade_requests";
import type { MembershipUpgradeRequestStatus } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useCallback, useEffect, useState } from "react";
import type { Fetcher } from "swr";
import { mutate } from "swr";

export type UpgradeRequestDecisionFilter = Exclude<
  MembershipUpgradeRequestStatus,
  "pending"
>;

function upgradeRequestsUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/upgrade-requests`;
}

// CSV download link for the resolved-requests, also apply filtering
export function upgradeRequestsHistoryCsvUrl(
  workspaceId: string,
  {
    decision,
    search,
  }: { decision?: UpgradeRequestDecisionFilter; search?: string } = {}
): string {
  const searchParams = new URLSearchParams({ format: "csv" });
  if (decision) {
    searchParams.set("decision", decision);
  }
  if (search && search.trim().length > 0) {
    searchParams.set("search", search.trim());
  }
  return `${upgradeRequestsUrl(workspaceId)}?${searchParams.toString()}`;
}

function usageStatusUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/usage-status`;
}

async function invalidateUpgradeRequests(workspaceId: string): Promise<void> {
  await mutate(
    (key) =>
      typeof key === "string" && key.startsWith(upgradeRequestsUrl(workspaceId))
  );
}

// Member-initiated: request a spend-limit upgrade for the current user. On
// success the usage-status read is revalidated so the banner reflects the now
// pending request.
export function useRequestUpgrade({ workspaceId }: { workspaceId: string }) {
  const sendNotification = useSendNotification();
  const { mutate: mutateUsageStatus } = useSWRWithDefaults(
    usageStatusUrl(workspaceId),
    null
  );

  const doRequestUpgrade = useCallback(
    async ({ reason }: { reason?: string }): Promise<boolean> => {
      const res = await clientFetch(upgradeRequestsUrl(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to request an upgrade",
          description: errorData.message,
        });
        return false;
      }

      await mutateUsageStatus();
      sendNotification({
        type: "success",
        title: "Upgrade requested",
        description: "Your workspace admins have been notified.",
      });
      return true;
    },
    [workspaceId, sendNotification, mutateUsageStatus]
  );

  return { doRequestUpgrade };
}

// Server-enforced page size
export const UPGRADE_REQUESTS_PAGE_SIZE = 100;

function useUpgradeRequestsList({
  workspaceId,
  status,
  pageIndex,
  searchTerm = "",
  decision,
  disabled,
}: {
  workspaceId: string;
  status: "pending" | "resolved";
  pageIndex: number;
  searchTerm?: string;
  decision?: UpgradeRequestDecisionFilter;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const upgradeRequestsFetcher: Fetcher<GetUpgradeRequestsResponseBody> =
    fetcher;

  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const offset = pageIndex * UPGRADE_REQUESTS_PAGE_SIZE;

  const searchParams = new URLSearchParams({
    status,
    offset: offset.toString(),
  });
  if (decision) {
    searchParams.set("decision", decision);
  }
  if (debouncedSearchTerm.trim().length > 0) {
    searchParams.set("search", debouncedSearchTerm.trim());
  }

  const { data, error } = useSWRWithDefaults(
    `${upgradeRequestsUrl(workspaceId)}?${searchParams.toString()}`,
    upgradeRequestsFetcher,
    { disabled, keepPreviousData: true }
  );

  return {
    requests: data?.requests ?? emptyArray(),
    totalCount: data?.total ?? 0,
    isLoading: !error && !data && !disabled,
    isError: !!error,
  };
}

// Admin-only: pending upgrade requests for the workspace, paginated. Fetched
// on the Usage page both to render the Requests tab and to back its count
// badge, so it is not gated behind tab visibility.
export function useUpgradeRequests({
  workspaceId,
  pageIndex,
  searchTerm,
  disabled,
}: {
  workspaceId: string;
  pageIndex: number;
  searchTerm?: string;
  disabled?: boolean;
}) {
  const { requests, totalCount, isLoading, isError } = useUpgradeRequestsList({
    workspaceId,
    status: "pending",
    pageIndex,
    searchTerm,
    disabled,
  });

  return {
    upgradeRequests: requests,
    totalUpgradeRequestsCount: totalCount,
    isUpgradeRequestsLoading: isLoading,
    isUpgradeRequestsError: isError,
  };
}

// Admin-only: resolved (approved/denied) upgrade requests, applies filtering
export function useUpgradeRequestsHistory({
  workspaceId,
  pageIndex,
  searchTerm,
  decision,
  disabled,
}: {
  workspaceId: string;
  pageIndex: number;
  searchTerm?: string;
  decision?: UpgradeRequestDecisionFilter;
  disabled?: boolean;
}) {
  const { requests, totalCount, isLoading, isError } = useUpgradeRequestsList({
    workspaceId,
    status: "resolved",
    pageIndex,
    searchTerm,
    decision,
    disabled,
  });

  return {
    upgradeRequestsHistory: requests,
    totalUpgradeRequestsHistoryCount: totalCount,
    isUpgradeRequestsHistoryLoading: isLoading,
    isUpgradeRequestsHistoryError: isError,
  };
}

export function useResolveUpgradeRequest({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();

  const doResolveUpgradeRequest = useCallback(
    async ({
      requestId,
      resolution,
    }: {
      requestId: string;
      resolution: UpgradeRequestResolution;
    }): Promise<boolean> => {
      const res = await clientFetch(
        `${upgradeRequestsUrl(workspaceId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resolution),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: "Failed to resolve upgrade request",
          description: errorData.message,
        });
        return false;
      }

      const body: PatchUpgradeRequestResponseBody = await res.json();
      const requesterName = body.request.requester.name;

      // Resolving always removes the request from the pending list. Only an
      // approval edits the member's seat / limit, so the members-usage surface
      // only needs refreshing on approve.
      await Promise.all([
        invalidateUpgradeRequests(workspaceId),
        resolution.status === "approved"
          ? invalidateMembersUsage(workspaceId)
          : Promise.resolve(),
      ]);

      switch (resolution.status) {
        case "approved":
          sendNotification({
            type: "success",
            title: "Upgrade request approved",
            description: `${requesterName}'s upgrade request has been approved.`,
          });
          break;
        case "denied":
          sendNotification({
            type: "success",
            title: "Upgrade request denied",
            description: `${requesterName}'s upgrade request has been denied.`,
          });
          break;
        default:
          assertNeverAndIgnore(resolution);
      }
      return true;
    },
    [workspaceId, sendNotification]
  );

  return { doResolveUpgradeRequest };
}
