import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  EnabledModelConfigurationType,
  GetEnabledModelsResponseType,
} from "@app/types/api/assistant/models";
import { isStaticModelId } from "@app/types/assistant/models/models";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";
import type { Fetcher } from "swr";

const EMPTY_DEGRADED_MODEL_IDS: ReadonlySet<string> = new Set();

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

  const degradedModelIds = useMemo(
    () => (data ? new Set(data.degradedModelIds) : EMPTY_DEGRADED_MODEL_IDS),
    [data]
  );

  return {
    models:
      data?.models.filter((model) => isStaticModelId(model.modelId)) ??
      emptyArray<EnabledModelConfigurationType>(),
    defaultModel: data?.defaultModel ?? null,
    streams: data?.streams ?? null,
    degradedModelIds,
    isModelsLoading: !error && !data && !disabled,
    isModelsError: !!error,
  };
}
