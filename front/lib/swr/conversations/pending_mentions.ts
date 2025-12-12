import type {
  GetPendingMentionsResponseBody,
  PendingMentionType,
} from "@app/pages/api/v1/w/[wId]/assistant/conversations/[cId]/mentions/pending";
import { useSWRWithDefaults } from "@app/lib/swr/swr";
import type { Fetcher } from "swr";

export function usePendingMentions({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  const pendingMentionsFetcher: Fetcher<GetPendingMentionsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/v1/w/${workspaceId}/assistant/conversations/${conversationId}/mentions/pending`,
    pendingMentionsFetcher
  );

  return {
    pendingMentions: data?.pendingMentions ?? [],
    isPendingMentionsLoading: !error && !data,
    isPendingMentionsError: error,
    mutatePendingMentions: mutate,
  };
}

async function fetcher(url: string): Promise<GetPendingMentionsResponseBody> {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error("Failed to fetch pending mentions");
  }

  return res.json();
}
