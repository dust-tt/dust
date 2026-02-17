import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAvailableModelsResponseType } from "@app/pages/api/w/[wId]/models";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useModels({ owner }: { owner: LightWorkspaceType }) {
  const modelsFetcher: Fetcher<GetAvailableModelsResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/models`,
    modelsFetcher
  );

  return {
    models: data?.models ?? emptyArray(),
    reasoningModels: data?.reasoningModels ?? emptyArray(),
    isModelsLoading: !error && !data,
    isModelsError: !!error,
  };
}
