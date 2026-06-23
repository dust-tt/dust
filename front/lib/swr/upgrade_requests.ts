import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetUpgradeRequestsResponseBody } from "@app/types/api/credits/upgrade_requests";
import type { MembershipUpgradeRequestStatus } from "@app/types/memberships";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useCallback } from "react";
import type { Fetcher } from "swr";

function upgradeRequestsUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/upgrade-requests`;
}

function usageStatusUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/usage-status`;
}

// Member-initiated: request a spend-limit upgrade for the current user. On
// success the usage-status read is revalidated so the banner reflects the now
// pending request.
export function useRequestUpgrade({ workspaceId }: { workspaceId: string }) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRWithDefaults(usageStatusUrl(workspaceId), null);

  const doRequestUpgrade = useCallback(async (): Promise<boolean> => {
    const res = await clientFetch(upgradeRequestsUrl(workspaceId), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
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

    await mutate();
    sendNotification({
      type: "success",
      title: "Upgrade requested",
      description: "Your workspace admins have been notified.",
    });
    return true;
  }, [workspaceId, sendNotification, mutate]);

  return { doRequestUpgrade };
}

// Admin-only: pending upgrade requests for the workspace. Fetched on the Usage
// page both to render the Requests tab and to back its count badge, so it is
// not gated behind tab visibility.
export function useUpgradeRequests({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const upgradeRequestsFetcher: Fetcher<GetUpgradeRequestsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    upgradeRequestsUrl(workspaceId),
    upgradeRequestsFetcher,
    { disabled }
  );

  const requests = data?.requests ?? emptyArray();

  return {
    upgradeRequests: requests,
    isUpgradeRequestsLoading: !error && !data && !disabled,
    isUpgradeRequestsError: !!error,
    mutateUpgradeRequests: mutate,
  };
}

export function useResolveUpgradeRequest({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutate } = useSWRWithDefaults(upgradeRequestsUrl(workspaceId), null);

  const doResolveUpgradeRequest = useCallback(
    async ({
      requestId,
      requesterName,
      status,
    }: {
      requestId: string;
      requesterName: string;
      status: Exclude<MembershipUpgradeRequestStatus, "pending">;
    }): Promise<boolean> => {
      const res = await clientFetch(
        `${upgradeRequestsUrl(workspaceId)}/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
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

      // Resolving always removes the request from the pending list. Only an
      // approval edits the member's seat / limit, so the members-usage surface
      // only needs refreshing on approve.
      await Promise.all([
        mutate(),
        status === "approved"
          ? invalidateMembersUsage(workspaceId)
          : Promise.resolve(),
      ]);

      switch (status) {
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
          assertNeverAndIgnore(status);
      }
      return true;
    },
    [workspaceId, sendNotification, mutate]
  );

  return { doResolveUpgradeRequest };
}
