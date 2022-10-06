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
