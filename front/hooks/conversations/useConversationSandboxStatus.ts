import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConversationSandboxResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/sandbox";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useConversationSandboxStatus({
  conversationId,
  owner,
  options,
}: {
  conversationId?: string | null;
  owner: LightWorkspaceType;
  options?: { disabled?: boolean };
}) {
  const { fetcher } = useFetcher();
  const sandboxFetcher: Fetcher<GetConversationSandboxResponseBody> = fetcher;

  const disabled = options?.disabled;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId && !disabled
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/sandbox`
      : null,
    sandboxFetcher,
    options
  );

  return {
    sandboxStatus: data?.sandboxStatus ?? null,
    isSandboxStatusLoading: !disabled && !error && !data,
    mutateSandboxStatus: mutate,
  };
}
