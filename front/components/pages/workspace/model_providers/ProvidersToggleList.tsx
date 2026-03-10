import { ProviderContextItem } from "@app/components/pages/workspace/model_providers/ProviderContextItem";
import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { isModelCustomAvailable } from "@app/lib/assistant";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { PlanType } from "@app/types/plan";
import type { ProvidersSelection } from "@app/types/provider_selection";
import { ContextItem } from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import uniqBy from "lodash/uniqBy";
import { type Dispatch, type SetStateAction, useCallback } from "react";

interface ProviderContextItemProps {
  providersSelection: ProvidersSelection;
  setProvidersSelection: Dispatch<SetStateAction<ProvidersSelection>>;
  isWorkspaceValidating: boolean;
  plan: PlanType;
}

export function ProvidersToggleList({
  providersSelection,
  setProvidersSelection,
  isWorkspaceValidating,
  plan,
}: ProviderContextItemProps) {
  const { featureFlags } = useFeatureFlags();

  // Filter models based on feature flags and build modelProviders dynamically
  const filteredModels = uniqBy(
    [...USED_MODEL_CONFIGS, ...REASONING_MODEL_CONFIGS],
    (m) => m.modelId
  ).filter(
    (model) =>
      !model.isLegacy && isModelCustomAvailable(model, featureFlags, plan)
  );

  const modelsDescriptionByProvider: Partial<
    Record<ModelProviderIdType, string>
  > = mapValues(
    groupBy(filteredModels, "providerId"),
    (modelConfigurations: ModelConfigurationType[]) =>
      modelConfigurations.map(({ displayName }) => displayName).join(", ")
  );

  const toggleProvider = useCallback(
    (provider: ModelProviderIdType) => {
      setProvidersSelection((previousSelection: ProvidersSelection) => ({
        ...previousSelection,
        [provider]: !previousSelection[provider],
      }));
    },
    [setProvidersSelection]
  );

  return (
    <ContextItem.List>
      {(
        Object.entries(modelsDescriptionByProvider) as [
          ModelProviderIdType,
          string,
        ][]
      ).map(([providerId, description]) => (
        <ProviderContextItem
          key={providerId}
          providerId={providerId}
          description={description}
          providersSelection={providersSelection}
          handleToggleChange={() => toggleProvider(providerId)}
          disabled={isWorkspaceValidating}
        />
      ))}
    </ContextItem.List>
  );
}
