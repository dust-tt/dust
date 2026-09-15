import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  EnabledModelConfigurationType,
  GetEnabledModelsResponseType,
} from "@app/types/api/assistant/models";
import { isStaticModelId } from "@app/types/assistant/models/models";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";
import { useSWRConfig } from "swr";

const EMPTY_DEGRADED_MODEL_IDS: ReadonlySet<string> = new Set();
const EMPTY_FALLBACK_STREAM_IDS: ReadonlySet<string> = new Set();

// The catalog itself barely moves, but the degraded models it reports do: an
// operator flagging a model mid-incident must reach tabs that stay open for
// hours without a reload. Polling pauses while the tab is hidden, and focus
// revalidation (throttled to the same cadence) covers coming back to it.
const MODELS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function getModelsSWRKey(workspaceId: string): string {
  return `/api/w/${workspaceId}/models`;
}

export function useRevalidateModels(owner: LightWorkspaceType) {
  const { mutate } = useSWRConfig();

  return useCallback(
    () => mutate(getModelsSWRKey(owner.sId)),
    [mutate, owner.sId]
  );
}

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
    getModelsSWRKey(owner.sId),
    modelsFetcher,
    {
      disabled,
      refreshInterval: MODELS_REFRESH_INTERVAL_MS,
      focusThrottleInterval: MODELS_REFRESH_INTERVAL_MS,
    }
  );

  const degradedModelIds = useMemo(
    () => (data ? new Set(data.degradedModelIds) : EMPTY_DEGRADED_MODEL_IDS),
    [data]
  );
  const fallbackStreamIds = useMemo(
    () =>
      data?.fallbackStreamIds
        ? new Set(data.fallbackStreamIds)
        : EMPTY_FALLBACK_STREAM_IDS,
    [data]
  );

  return {
    models:
      data?.models.filter((model) => isStaticModelId(model.modelId)) ??
      emptyArray<EnabledModelConfigurationType>(),
    defaultModel: data?.defaultModel ?? null,
    streams: data?.streams ?? null,
    fallbackStreamIds,
    degradedModelIds,
    isModelsLoading: !error && !data && !disabled,
    isModelsError: !!error,
  };
}
