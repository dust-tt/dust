import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { invalidateSharedUsageLimitOverlaps } from "@app/hooks/useSharedUsageLimitOverlaps";
import { clientFetch } from "@app/lib/egress/client";
import { invalidateMembersUsage } from "@app/lib/swr/memberships";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

export function useUpdateSharedUsageLimitPriorities({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doUpdateSharedUsageLimitPriorities = useCallback(
    async ({
      orderedGroupIds,
      expectedOrderedGroupIds,
    }: {
      orderedGroupIds: string[];
      expectedOrderedGroupIds: string[];
    }): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/groups/shared_usage_limit_priorities`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderedGroupIds, expectedOrderedGroupIds }),
        }
      );

      if (!res.ok) {
        sendApiErrorNotification({
          title: t`Failed to update the order of group budgets`,
          error: await res.json(),
        });
        await invalidateSharedUsageLimitOverlaps(owner.sId);
        return false;
      }

      sendNotification({
        type: "success",
        title: t`Order of group budgets updated`,
        description: t`Members in several groups now use the budget of the first one in the new order.`,
      });
      await Promise.all([
        invalidateSharedUsageLimitOverlaps(owner.sId),
        invalidateMembersUsage(owner.sId),
      ]);
      return true;
    },
    [owner.sId, sendApiErrorNotification, sendNotification, t]
  );

  return { doUpdateSharedUsageLimitPriorities };
}
