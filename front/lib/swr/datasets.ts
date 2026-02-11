import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDatasetsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/datasets";
import type { GetDatasetResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/datasets/[name]";
import type { AppType } from "@app/types/app";
import type { LightWorkspaceType } from "@app/types/user";

export function useDatasets({
  owner,
  app,
  disabled,
}: {
  owner: LightWorkspaceType;
  app: AppType | null;
  disabled?: boolean;
}) {
  const datasetsFetcher: Fetcher<GetDatasetsResponseBody> = fetcher;
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  const isDisabled = disabled || !app;

  const { data, error } = useSWRWithDefaults(
    app
      ? `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`
      : null,
    datasetsFetcher,
    {
      disabled: isDisabled,
    }
  );

  return {
    datasets: data?.datasets ?? emptyArray(),
    isDatasetsLoading: !isDisabled && !error && !data,
    isDatasetsError: !!error,
  };
}

export function useDataset(
  owner: LightWorkspaceType,
  app: AppType | null,
  dataset: string | undefined,
  showData = false
) {
  const datasetFetcher: Fetcher<GetDatasetResponseBody> = fetcher;
  const disabled = !dataset || !app;
  const { data, error, mutate } = useSWRWithDefaults(
    app && dataset
      ? `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${dataset}${
          showData ? "?data=true" : ""
        }`
      : null,
    datasetFetcher,
    { disabled }
  );

  return {
    dataset: data ? data.dataset : null,
    isDatasetLoading: !error && !data && !disabled,
    isDatasetError: !!error,
    mutateDataset: mutate,
  };
}
