import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetExtensionConfigResponseBody } from "@app/pages/api/w/[wId]/extension/config";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useExtensionConfig(owner: LightWorkspaceType) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetExtensionConfigResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/extension/config`,
    configFetcher
  );

  return {
    blacklistedDomains: data?.blacklistedDomains ?? emptyArray(),
    isExtensionConfigLoading: !error && !data,
    isExtensionConfigError: error,
  };
}
