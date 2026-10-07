import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
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
          title: t`Failed to update the shared limit`,
          error: await res.json(),
        });
        return false;
      }

      const amount =
        limit.kind === "limited" ? formatNumber(limit.awuCredits) : "";
      sendNotification({
        type: "success",
        title: t`Shared limit updated`,
        description:
          limit.kind === "limited"
            ? t`${groupName}'s shared limit is now ${amount} credits per billing cycle.`
            : t`${groupName}'s shared limit has been removed.`,
      });
      await mutate(`/api/w/${owner.sId}/credits/groups-usage`);
      return true;
    },
    [owner.sId, sendApiErrorNotification, sendNotification, t]
  );

  return { doUpdateGroupSharedUsageLimit };
}
