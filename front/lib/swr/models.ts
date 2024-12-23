import type { LightWorkspaceType } from "@dust-tt/types";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetAvailableModelsResponseType } from "@app/pages/api/w/[wId]/models";

export function useModels({ owner }: { owner: LightWorkspaceType }) {
  const modelsFetcher: Fetcher<GetAvailableModelsResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/models`,
    modelsFetcher
  );

  return {
    models: data ? data.models : [],
    isModelsLoading: !error && !data,
    isModelsError: !!error,
  };
}