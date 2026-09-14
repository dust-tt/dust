import { AllProvidersToggle } from "@app/components/pages/workspace/model_providers/AllProvidersToggle";
import { EmbeddingModelSelect } from "@app/components/pages/workspace/model_providers/EmbeddingModelSelect";
import { ProvidersConfigurationList } from "@app/components/pages/workspace/model_providers/ProvidersConfigurationList";
import { ProvidersToggleList } from "@app/components/pages/workspace/model_providers/ProvidersToggleList";
import { RegionalModelsOnlyToggle } from "@app/components/pages/workspace/model_providers/RegionalModelsOnlyToggle";
import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { isModelAvailable } from "@app/lib/assistant";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { useAppRouter } from "@app/lib/platform";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import type {
  ModelConfigurationType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";
import type { ProvidersSelection } from "@app/types/provider_selection";
import type { WorkspaceType } from "@app/types/user";
import { ArrowRight, Button } from "@dust-tt/sparkle";
import groupBy from "lodash/groupBy";
import mapValues from "lodash/mapValues";
import uniqBy from "lodash/uniqBy";

interface ModelProvidersPageContentProps {
  workspace: WorkspaceType;
  providersSelection: ProvidersSelection;
  isWorkspaceValidating: boolean;
  onToggleProvider: (provider: ModelProviderIdType) => void;
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
  const router = useAppRouter();

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
        <ProvidersConfigurationList
          owner={workspace}
          modelsDescriptionByProvider={modelsDescriptionByProvider}
        />
      ) : (
        <>
          <RegionalModelsOnlyToggle workspace={workspace} />
          <AllProvidersToggle
            providersSelection={providersSelection}
            onSelectAll={onSelectAllProviders}
          />
          <ProvidersToggleList
            providersSelection={providersSelection}
            onToggleProvider={onToggleProvider}
            isWorkspaceValidating={isWorkspaceValidating}
            modelsDescriptionByProvider={modelsDescriptionByProvider}
          />
        </>
      )}
      <EmbeddingModelSelect workspace={workspace} />
      <div className="flex flex-col gap-2 p-3">
        <div className="font-semibold">Model access tiers</div>
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">
            Model access tiers let members use models up to their highest
            allowed tier — set per workspace, group, or member.
          </div>
          <Button
            label="Manage in Usage"
            variant="highlight-ghost"
            size="sm"
            iconRight={ArrowRight}
            onClick={() => {
              void router.push(`/w/${workspace.sId}/usage`);
            }}
          />
        </div>
      </div>
    </div>
  );
}
