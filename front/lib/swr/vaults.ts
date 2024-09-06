import type { DataSourceViewCategory } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, SWR_KEYS, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetVaultsResponseBody } from "@app/pages/api/w/[wId]/vaults";
import type { GetVaultResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]";
import type { GetVaultDataSourceViewsResponseBody } from "@app/pages/api/w/[wId]/vaults/[vId]/data_source_views";

export function useVaults({ workspaceId }: { workspaceId: string }) {
  const vaultsFetcher: Fetcher<GetVaultsResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    SWR_KEYS.vaults(workspaceId),
    vaultsFetcher
  );

  return {
    vaults: data ? data.vaults : null,
    isVaultsLoading: !error && !data,
    isVaultsError: error,
  };
}

export function useVaultInfo({
  workspaceId,
  vaultId,
  disabled,
}: {
  workspaceId: string;
  vaultId: string;
  disabled?: boolean;
}) {
  const vaultsCategoriesFetcher: Fetcher<GetVaultResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${workspaceId}/vaults/${vaultId}`,
    vaultsCategoriesFetcher
  );

  return {
    vaultInfo: data ? data.vault : null,
    mutateVaultInfo: mutate,
    isVaultInfoLoading: !error && !data,
    isVaultInfoError: error,
  };
}

export function useVaultDataSourceViews<
  IncludeConnectorDetails extends boolean,
>({
  category,
  disabled,
  includeConnectorDetails,
  includeEditedBy,
  vaultId,
  workspaceId,
}: {
  category: Exclude<DataSourceViewCategory, "apps">;
  disabled?: boolean;
  includeConnectorDetails?: IncludeConnectorDetails;
  includeEditedBy?: boolean;
  vaultId: string;
  workspaceId: string;
}) {
  const vaultsDataSourceViewsFetcher: Fetcher<
    GetVaultDataSourceViewsResponseBody<IncludeConnectorDetails>
  > = fetcher;

  const queryParams = new URLSearchParams({
    category,
  });

  if (includeConnectorDetails) {
    queryParams.set("includeConnectorDetails", "true");
  }
  if (includeEditedBy) {
    queryParams.set("includeEditedBy", "true");
  }

  const { data, error, mutate } = useSWRWithDefaults(
    disabled
      ? null
      : `/api/w/${workspaceId}/vaults/${vaultId}/data_source_views?${queryParams.toString()}`,
    vaultsDataSourceViewsFetcher
  );

  const vaultDataSourceViews = useMemo(() => {
    return (data?.dataSourceViews ??
      []) as GetVaultDataSourceViewsResponseBody<IncludeConnectorDetails>["dataSourceViews"];
  }, [data]);

  return {
    vaultDataSourceViews,
    mutateVaultDataSourceViews: mutate,
    isVaultDataSourceViewsLoading: !error && !data,
    isVaultDataSourceViewsError: error,
  };
}
