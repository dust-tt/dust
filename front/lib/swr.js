import useSWR from "swr";

export const fetcher = (...args) => fetch(...args).then((res) => res.json());

export function useDatasets(user, app) {
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/datasets`,
    fetcher
  );

  return {
    datasets: data ? data.datasets : [],
    isDatasetsLoading: !error && !data,
    isDatasetsError: error,
  };
}

export function useProviders() {
  const { data, error } = useSWR(`/api/providers`, fetcher);

  return {
    providers: data ? data.providers : [],
    isProvidersLoading: !error && !data,
    isProvidersError: error,
  };
}

export function useSavedRunStatus(user, app, refresh) {
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs/saved/status`,
    fetcher,
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

export function useRunBlock(user, app, runId, type, name, refresh) {
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs/${runId}/blocks/${type}/${name}`,
    fetcher,
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
  const { data, error } = useSWR(`/api/keys`, fetcher);

  return {
    keys: data ? data.keys : [],
    isKeysLoading: !error && !data,
    isKeysError: error,
  };
}

export function useRuns(user, app, limit, offset, runType) {
  const { data, error } = useSWR(
    `/api/apps/${user}/${app.sId}/runs?limit=${limit}&offset=${offset}&runType=${runType}`,
    fetcher
  );

  return {
    runs: data ? data.runs : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDocuments(user, dataSource, limit, offset) {
  const { data, error } = useSWR(
    `/api/data_sources/${user}/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
    fetcher
  );

  return {
    documents: data ? data.documents : [],
    total: data ? data.total : 0,
    isRunsLoading: !error && !data,
    isRunsError: error,
  };
}

export function useDataSources(user) {
  const { data, error } = useSWR(`/api/data_sources/${user}`, fetcher);

  return {
    dataSources: data ? data.dataSources : [],
    isDataSourcesLoading: !error && !data,
    isDataSourcesError: error,
  };
}
