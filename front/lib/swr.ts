import { GetDatasetResponseBody } from "@app/pages/api/apps/[user]/[sId]/datasets";
import { GetRunsResponseBody } from "@app/pages/api/apps/[user]/[sId]/runs";
import { GetRunBlockResponseBody } from "@app/pages/api/apps/[user]/[sId]/runs/[runId]/blocks/[type]/[name]";
import { GetRunStatusResponseBody } from "@app/pages/api/apps/[user]/[sId]/runs/[runId]/status";
import { GetDataSourcesResponseBody } from "@app/pages/api/data_sources/[user]";
import { GetDocumentsResponseBody } from "@app/pages/api/data_sources/[user]/[name]/documents";
import { GetKeysResponseBody } from "@app/pages/api/keys";
import { GetProvidersResponseBody } from "@app/pages/api/providers";
import useSWR, { Fetcher } from "swr";

export const fetcher = (...args: Parameters<typeof fetch>) =>
  fetch(...args).then((res) => res.json());

export function useDatasets(user: string, app: { sId: string }) {
  const datasetsFetcher: Fetcher<GetDatasetResponseBody> = fetcher;

  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/datasets`,
    datasetsFetcher
  );

  return {
    datasets: data ? data.datasets : [],
    isDatasetsLoading: !error && !data,
    isDatasetsError: !!error,
  };
}

export function useProviders() {
  const providersFetcher: Fetcher<GetProvidersResponseBody> = fetcher;

  const { data, error } = useSWR(`/api/providers`, providersFetcher);

  return {
    providers: data ? data.providers : [],
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}

export function useSavedRunStatus(
  user: string,
  app: { sId: string },
  refresh: number
) {
  const runStatusFetcher: Fetcher<GetRunStatusResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs/saved/status`,
    runStatusFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useRunBlock(
  user: string,
  app: { sId: string },
  runId: string,
  type: string,
  name: string,
  refresh: number
) {
  const runBlockFetcher: Fetcher<GetRunBlockResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs/${runId}/blocks/${type}/${name}`,
    runBlockFetcher,
    {
      refreshInterval: refresh,
    }
  );

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useKeys() {
  const keysFetcher: Fetcher<GetKeysResponseBody> = fetcher;
  const { data, error } = useSWR(`/api/keys`, keysFetcher);

  return {
    keys: data ? data.keys : [],
    isKeysLoading: !error && !data,
    isKeysError: error,
  };
}

export function useRuns(
  user: string,
  app: { sId: string },
  limit: number,
  offset: number,
  runType: string
) {
  const runsFetcher: Fetcher<GetRunsResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`,
    runsFetcher
  );

  return {
    runs: data ? data.runs : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDocuments(
  user: string,
  dataSource: { name: string },
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/data_sources/${user}/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
    documentsFetcher
  );

  return {
    documents: data ? data.documents : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDataSources(user: string) {
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error } = useSWR(
    `/api/data_sources/${user}`,
    dataSourcesFetcher
  );

  return {
    dataSources: data ? data.dataSources : [],
    isDataSourcesLoading: !error && !data,
    isDataSourcesError: error,
  };
}
