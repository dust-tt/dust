import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationOpenBranchResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/branches";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

export function useOpenConversationBranch({
  owner,
  conversationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const branchFetcher: Fetcher<GetConversationOpenBranchResponse> = fetcher;

  const { data, mutate: mutateOpenBranch } = useSWRWithDefaults(
    `/api/w/${owner.sId}/assistant/conversations/${conversationId}/branches`,
    branchFetcher,
    {
      revalidateIfStale: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      disabled,
    }
  );

  const openBranch = useMemo(() => data?.branch ?? null, [data]);

  return { openBranch, mutateOpenBranch };
}
