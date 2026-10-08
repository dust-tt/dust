import { useConversations } from "@app/hooks/conversations/useConversations";
import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import type {
  UserWakeUps,
  UserWakeUpWithConversation,
} from "@app/lib/api/assistant/wakeups";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationWakeUpsResponseBody } from "@app/types/api/assistant/conversation/wakeups";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { isActiveWakeUp } from "@app/types/assistant/wakeups";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();
  const { mutateWakeUps } = useConversationWakeUps({
    owner,
    conversationId,
    disabled: true,
  });
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const cancelWakeUp = useCallback(
    async (wakeUpId: string) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/wakeups/${wakeUpId}`,
        { method: "DELETE" }
      );

      if (!res.ok) {
        const json = await res.json();
        sendApiErrorNotification({
          title: t`Failed to cancel wake-up`,
          error: json,
        });
        return false;
      }

      sendNotification({ type: "success", title: t`Wake-up cancelled` });
      void mutateWakeUps();
      void mutateConversations(
        (currentData: ConversationListItemType[] | undefined) =>
          currentData?.map((c) =>
            c.sId === conversationId ? { ...c, nextWakeupAt: null } : c
          ),
        { revalidate: false }
      );
      return true;
    },
    [
      owner.sId,
      conversationId,
      sendNotification,
      sendApiErrorNotification,
      mutateWakeUps,
      mutateConversations,
      t,
    ]
  );

  return { cancelWakeUp };
}

export function useUserWakeUps({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const userWakeUpsFetcher: Fetcher<UserWakeUps> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/me/wakeups`,
    userWakeUpsFetcher,
    { disabled }
  );

  return {
    wakeUps: data?.wakeUps ?? emptyArray<UserWakeUpWithConversation>(),
    isWakeUpsLoading: !error && !data && !disabled,
    isWakeUpsError: !!error,
    mutateWakeUps: mutate,
  };
}
