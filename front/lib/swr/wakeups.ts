import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationWakeUpsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/wakeups";
import { isActiveWakeUp } from "@app/types/assistant/wakeups";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationWakeUps({
  owner,
  conversationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const wakeUpsFetcher: Fetcher<GetConversationWakeUpsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/wakeups`
      : null,
    wakeUpsFetcher,
    { disabled }
  );

  const wakeUps = data?.wakeUps ?? emptyArray();
  const activeWakeUp = useMemo(
    () => wakeUps.find((w) => isActiveWakeUp(w)) ?? null,
    [wakeUps]
  );

  return {
    wakeUps,
    activeWakeUp,
    // TODO(wake-up): derive from the API response once it exposes ownership info; for now the
    // cancel endpoint 403s if the caller is not the wake-up owner or a workspace admin.
    isActiveWakeUpOwner: !!activeWakeUp,
    isWakeUpsLoading: !error && !data && !disabled,
    isWakeUpsError: !!error,
    mutateWakeUps: mutate,
  };
}

export function useCancelWakeUp({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
}) {
  const sendNotification = useSendNotification();
  const { mutateWakeUps } = useConversationWakeUps({
    owner,
    conversationId,
    disabled: true,
  });

  const cancelWakeUp = useCallback(
    async (wakeUpSId: string) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/wakeups/${wakeUpSId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const json = await res.json();
        sendNotification({
          type: "error",
          title: "Failed to cancel wake-up",
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          description: json.error?.message || "Failed to cancel wake-up",
        });
        return false;
      }

      sendNotification({ type: "success", title: "Wake-up cancelled" });
      void mutateWakeUps();
      return true;
    },
    [owner.sId, conversationId, sendNotification, mutateWakeUps]
  );

  return { cancelWakeUp };
}
