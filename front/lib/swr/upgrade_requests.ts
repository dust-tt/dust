import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
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
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

function upgradeRequestsUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/credits/upgrade-requests`;
}

function usageStatusUrl(workspaceId: string): string {
  return `/api/w/${workspaceId}/usage-status`;
}

// `error` is formatted by the caller with `formatError`.
export type RequestUpgradeError = { errorType: string; error: unknown };
export type RequestUpgradeResult = Result<void, RequestUpgradeError>;

// Member-initiated: request a spend-limit upgrade for the current user. On
// success the usage-status read is revalidated so the banner reflects the now
// pending request.
export function useRequestUpgrade({ workspaceId }: { workspaceId: string }) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutate } = useSWRWithDefaults(usageStatusUrl(workspaceId), null);

  const doRequestUpgrade = useCallback(
    async ({ reason }: { reason?: string }): Promise<RequestUpgradeResult> => {
      const res = await clientFetch(upgradeRequestsUrl(workspaceId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        const errorType =
          "type" in errorData ? errorData.type : "unknown_error";
        // A rejected reason is shown inline on the field by the caller, not as
        // a toast.
        if (errorType !== "invalid_request_error") {
          sendApiErrorNotification({
            title: t`Failed to request an upgrade`,
            error: errorData,
          });
        }
        return new Err({ errorType, error: errorData });
      }

      await mutate();
      sendNotification({
        type: "success",
        title: t`Upgrade requested`,
        description: t`Your workspace admins have been notified.`,
      });
      return new Ok(undefined);
    },
    [workspaceId, sendNotification, mutate, sendApiErrorNotification, t]
  );

  return { doRequestUpgrade };
}

// Pending upgrade requests in the caller's scope. Fetched on the Usage
// page both to render the Requests tab and to back its count badge, so it is
// not gated behind tab visibility.
export function useUpgradeRequests({
  workspaceId,
  disabled,
  groupId,
  searchTerm = "",
}: {
  workspaceId: string;
  disabled?: boolean;
  groupId?: string;
  searchTerm?: string;
}) {
  const { fetcher } = useFetcher();
  const upgradeRequestsFetcher: Fetcher<GetUpgradeRequestsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    groupId
      ? `${upgradeRequestsUrl(workspaceId)}?${new URLSearchParams({ groupId })}`
      : upgradeRequestsUrl(workspaceId),
    upgradeRequestsFetcher,
    { disabled }
  );

  const requests = data?.requests ?? emptyArray();
  const filteredRequests = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();
    return requests.filter(
      ({ requester, status }) =>
        status === "pending" &&
        (!search ||
          requester.name.toLowerCase().includes(search) ||
          requester.email?.toLowerCase().includes(search))
    );
  }, [requests, searchTerm]);

  return {
    upgradeRequests: filteredRequests,
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutate } = useSWRConfig();

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
      let res: Response | null;
      try {
        res = await clientFetch(
          `${upgradeRequestsUrl(workspaceId)}/${requestId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status }),
          }
        );
      } catch {
        // Fetch can fail before receiving an HTTP response (for example, when offline).
        res = null;
      }

      // Refresh every group-filtered list, including when another manager already resolved it.
      await mutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(upgradeRequestsUrl(workspaceId))
      );
      if (!res?.ok) {
        sendApiErrorNotification({
          title:
            status === "approved"
              ? t`Changes saved, but approval failed`
              : t`Failed to resolve upgrade request`,
          error: res
            ? await getErrorFromResponse(res)
            : {
                type: "unexpected_network_error",
                message: "Could not reach the server.",
              },
        });
        return false;
      }

      // Resolving always removes the request from the pending list. Only an
      // approval edits the member's seat / limit, so the members-usage surface
      // only needs refreshing on approve.
      if (status === "approved") {
        await invalidateMembersUsage(workspaceId);
      }

      switch (status) {
        case "approved":
          sendNotification({
            type: "success",
            title: t`Upgrade request approved`,
            description: t`${requesterName}'s upgrade request has been approved.`,
          });
          break;
        case "denied":
          sendNotification({
            type: "success",
            title: t`Upgrade request denied`,
            description: t`${requesterName}'s upgrade request has been denied.`,
          });
          break;
        default:
          assertNeverAndIgnore(status);
      }
      return true;
    },
    [workspaceId, sendNotification, sendApiErrorNotification, mutate, t]
  );

  return { doResolveUpgradeRequest };
}
