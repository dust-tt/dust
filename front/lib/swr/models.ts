import type { GetEnabledModelsResponseType } from "@app/lib/api/assistant/models";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useModels({ owner }: { owner: LightWorkspaceType }) {
  const { fetcher } = useFetcher();
  const modelsFetcher: Fetcher<GetEnabledModelsResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/models`,
    modelsFetcher
  );

  return {
    models: data?.models ?? emptyArray(),
    isModelsLoading: !error && !data,
    isModelsError: !!error,
  };
}
