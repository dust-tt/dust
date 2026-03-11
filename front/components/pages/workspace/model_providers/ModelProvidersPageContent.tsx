import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersToggleList } from "@app/components/pages/workspace/model_providers/ProvidersToggleList";
import {
  REASONING_MODEL_CONFIGS,
  USED_MODEL_CONFIGS,
} from "@app/components/providers/types";
import { isModelCustomAvailable } from "@app/lib/assistant";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import uniqBy from "lodash/uniqBy";
import type { Dispatch, SetStateAction } from "react";

interface ModelProvidersPageContentProps {
  workspace: WorkspaceType;
  setProvidersSelection: Dispatch<SetStateAction<ProvidersSelection>>;
  providersSelection: ProvidersSelection;
  isWorkspaceValidating: boolean;
}

export function ModelProvidersPageContent({
  workspace,
  setProvidersSelection,
  providersSelection,
  isWorkspaceValidating,
}: ModelProvidersPageContentProps) {
  const { subscription } = useAuth();
  const { plan } = subscription;
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

  return (
    <div className="flex flex-col gap-8">
      {plan.isByok ? (
        <></>
      ) : (
        <>
          <AllProvidersToggle
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
          />
          <ProvidersToggleList
            providersSelection={providersSelection}
            setProvidersSelection={setProvidersSelection}
            isWorkspaceValidating={isWorkspaceValidating}
            modelsDescriptionByProvider={modelsDescriptionByProvider}
          />
        </>
      )}
      <EmbeddingModelSelect workspace={workspace} />
    </div>
  );
}
