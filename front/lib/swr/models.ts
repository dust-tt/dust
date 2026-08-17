import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetEnabledModelsResponseType } from "@app/types/api/assistant/models";
import type { LightWorkspaceType } from "@app/types/user";
import type { Fetcher } from "swr";

export function useModels({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const modelsFetcher: Fetcher<GetEnabledModelsResponseType> = fetcher;

  const { data, error } = useSWRWithDefaults(
    `/api/w/${owner.sId}/models`,
    modelsFetcher,
    { disabled, revalidateOnFocus: false }
  );

  return {
    models: data?.models ?? emptyArray(),
    defaultModel: data?.defaultModel ?? null,
    streams: data?.streams ?? null,
    isModelsLoading: !error && !data && !disabled,
    isModelsError: !!error,
  };
}
