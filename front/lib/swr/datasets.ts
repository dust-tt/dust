import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDatasetsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/datasets";
import type { GetDatasetResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps/[aId]/datasets/[name]";
import type { AppType, LightWorkspaceType } from "@app/types";

export function useDatasets({
  owner,
  app,
  disabled,
}: {
  owner: LightWorkspaceType;
  app: AppType;
  disabled: boolean;
}) {
  const datasetsFetcher: Fetcher<GetDatasetsResponseBody> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets`,
    datasetsFetcher,
    {
      disabled,
    }
  );

  return {
    datasets: useMemo(() => (data ? data.datasets : []), [data]),
    isDatasetsLoading: !error && !data,
    isDatasetsError: !!error,
  };
}

export function useDataset(
  owner: LightWorkspaceType,
  app: AppType,
  dataset: string | undefined,
  showData = false
) {
  const datasetFetcher: Fetcher<GetDatasetResponseBody> = fetcher;
  const disabled = !dataset;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}/datasets/${dataset}${
      showData ? "?data=true" : ""
    }`,
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
