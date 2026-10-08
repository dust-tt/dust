import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersConfigurationList } from "@app/components/pages/workspace/model_providers/ProvidersConfigurationList";
import { ProvidersToggleList } from "@app/components/pages/workspace/model_providers/ProvidersToggleList";
import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { isModelAvailable } from "@app/lib/assistant";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatList } from "@app/lib/i18n/format";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import {
  getModelMaker,
  isWhitelistableModelMakerId,
} from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
  WhitelistableModelMakerIdType,
} from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import pickBy from "lodash/pickBy";
import uniqBy from "lodash/uniqBy";

interface ModelProvidersPageContentProps {
  workspace: WorkspaceType;
  providersSelection: ProvidersSelection;
  isWorkspaceValidating: boolean;
  onToggleProvider: (provider: WhitelistableModelMakerIdType) => void;
  onSelectAllProviders: () => void;
}

export function ModelProvidersPageContent({
  workspace,
  providersSelection,
  isWorkspaceValidating,
  onToggleProvider,
  onSelectAllProviders,
}: ModelProvidersPageContentProps) {
  const { subscription } = useAuth();
  const { plan } = subscription;
  const { featureFlags } = useFeatureFlags();
  const { cellInfo } = useCellContext();

  // Filter models based on feature flags and build modelProviders dynamically
  const filteredModels = uniqBy(USED_MODEL_CONFIGS, (m) => m.modelId).filter(
    (model) =>
      !isModelStreamId(model.modelId) &&
      !model.isLegacy &&
      isModelAvailable(model, {
        featureFlags,
        plan,
        regionalModelsOnly: workspace.regionalModelsOnly,
        region: cellInfo.region,
      })
  );

  const describeModels = (modelConfigurations: ModelConfigurationType[]) =>
    formatList(
      modelConfigurations.map(({ displayName }) => displayName),
      { type: "conjunction" },
      getActiveLocale()
    );

  // BYOK keys belong to the serving provider.
  const modelsDescriptionByProvider: Partial<
    Record<ModelProviderIdType, string>
  > = mapValues(groupBy(filteredModels, "providerId"), describeModels);

  // Whitelisting is by lab: GLM-5.3 is listed under Z.ai whoever serves it.
  const modelsDescriptionByMaker: Partial<
    Record<WhitelistableModelMakerIdType, string>
  > = pickBy(
    mapValues(groupBy(filteredModels, getModelMaker), describeModels),
    (_, makerId) => isWhitelistableModelMakerId(makerId)
  );

  return (
    <div className="flex flex-col gap-8">
      {plan.isByok ? (
        <ProvidersConfigurationList
          owner={workspace}
          modelsDescriptionByProvider={modelsDescriptionByProvider}
        />
      ) : (
        <ProvidersToggleList
          workspace={workspace}
          providersSelection={providersSelection}
          onToggleProvider={onToggleProvider}
          onSelectAll={onSelectAllProviders}
          isWorkspaceValidating={isWorkspaceValidating}
          modelsDescriptionByMaker={modelsDescriptionByMaker}
        />
      )}
      <EmbeddingModelSelect workspace={workspace} />
    </div>
  );
}
