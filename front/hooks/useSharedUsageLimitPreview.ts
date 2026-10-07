import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetSharedUsageLimitPreviewResponseBody,
  SharedUsageLimit,
} from "@app/types/api/groups/shared_usage_limit";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useSharedUsageLimitPreview({
  owner,
  groupId,
  limit,
  disabled,
}: {
  owner: LightWorkspaceType;
  groupId: string;
  limit: SharedUsageLimit | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const previewFetcher: Fetcher<GetSharedUsageLimitPreviewResponseBody> =
    fetcher;

  const query =
    limit === null
      ? null
      : limit.kind === "limited"
        ? `kind=limited&awuCredits=${limit.awuCredits}`
        : "kind=unlimited";
  const isDisabled = disabled || query === null;

  const { data, error, isLoading } = useSWRWithDefaults(
    `/api/w/${owner.sId}/groups/${groupId}/shared_usage_limit/preview?${query}`,
    previewFetcher,
    { disabled: isDisabled, keepPreviousData: true }
  );

  return {
    preview: data ?? null,
    isPreviewLoading: !isDisabled && isLoading,
    isPreviewError: !!error,
  };
}
