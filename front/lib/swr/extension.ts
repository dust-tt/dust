import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetExtensionConfigResponseBody } from "@app/pages/api/w/[wId]/extension/config";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useExtensionConfig(
  owner: LightWorkspaceType,
  disabled?: boolean
) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetExtensionConfigResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/extension/config`,
    configFetcher,
    {
      disabled,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      dedupingInterval: 5 * 60 * 1000, // 5 minutes.
    }
  );

  return {
    blacklistedDomains: data?.blacklistedDomains ?? emptyArray(),
    isExtensionConfigLoading: !error && !data && !disabled,
    isExtensionConfigError: error,
  };
}
