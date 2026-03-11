import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationAttachmentsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/attachments";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useConversationAttachments({
  conversationId,
  options,
  owner,
}: {
  conversationId?: string | null;
  options?: { disabled?: boolean };
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const conversationAttachmentsFetcher: Fetcher<GetConversationAttachmentsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/attachments`
      : null,
    conversationAttachmentsFetcher,
    options
  );

  return {
    attachments: useMemo(() => data?.attachments ?? [], [data]),
    isConversationAttachmentsLoading: !error && !data,
    isConversationAttachmentsError: error,
    mutateConversationAttachments: mutate,
  };
}
