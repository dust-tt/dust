import { groupsUsageUrl } from "@app/hooks/useGroupsUsage";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { invalidateSharedUsageLimitOverlaps } from "@app/hooks/useSharedUsageLimitOverlaps";
import { clientFetch } from "@app/lib/egress/client";
import { formatNumber } from "@app/lib/i18n/format";
import type { SharedUsageLimit } from "@app/types/api/groups/shared_usage_limit";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import { mutate } from "swr";

export function useUpdateGroupSharedUsageLimit({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const doUpdateGroupSharedUsageLimit = useCallback(
    async ({
      groupId,
      groupName,
      limit,
    }: {
      groupId: string;
      groupName: string;
      limit: SharedUsageLimit;
    }): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/groups/${groupId}/shared_usage_limit`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(limit),
        }
      );

      if (!res.ok) {
        sendApiErrorNotification({
          title: t`Failed to update the group budget`,
          error: await res.json(),
        });
        return false;
      }

      let description = t`${groupName}'s budget has been removed.`;
      if (limit.kind === "limited") {
        const amount = formatNumber(limit.awuCredits);
        description = t`${groupName}'s budget is now ${amount} credits per billing cycle.`;
      }
      sendNotification({
        type: "success",
        title: t`Group budget updated`,
        description,
      });
      await Promise.all([
        mutate(groupsUsageUrl(owner.sId)),
        invalidateSharedUsageLimitOverlaps(owner.sId),
      ]);
      return true;
    },
    [owner.sId, sendApiErrorNotification, sendNotification, t]
  );

  return { doUpdateGroupSharedUsageLimit };
}
