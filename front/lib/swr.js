import useSWR from "swr";

export const fetcher = (...args) => fetch(...args).then((res) => res.json());

export function useDatasets(app) {
  const { data, error } = useSWR(`/api/apps/${app.sId}/datasets`, fetcher);

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

export function useSavedRunStatus(app, refresh) {
  const { data, error } = useSWR(`/api/apps/${app.sId}/runs/saved/status`, fetcher, {
    refreshInterval: refresh,
  });

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}

export function useSavedRunBlock(app, type, name, refresh) {
  const { data, error } = useSWR(`/api/apps/${app.sId}/runs/saved/blocks/${type}/${name}`, fetcher, {
    refreshInterval: refresh,
  });

  return {
    run: data ? data.run : null,
    isRunLoading: !error && !data,
    isRunError: error,
  };
}