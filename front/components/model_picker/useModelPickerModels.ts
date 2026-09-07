import type { MakerGroup } from "@app/components/model_picker/modelPickerUtils";
import { MODEL_TIERS } from "@app/components/model_picker/modelPickerUtils";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useCellContext } from "@app/lib/auth/CellContext";
import { getSupportedModelConfigs } from "@app/lib/llms/model_configurations";
import { useModels } from "@app/lib/swr/models";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import { getModelMaker } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ModelMakerIdType,
} from "@app/types/assistant/models/types";
import { isCreditPricedPlan } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

// "select" picks a model to run; "filter" only names one. A filter must reach
// every model an agent can already sit on, so it drops the member's tier and
// plan restrictions instead of padlocking the rows they exclude.
type ModelPickerMenuMode = "select" | "filter";

const EMPTY_DEGRADED_MODEL_IDS: ReadonlySet<string> = new Set();

/**
 * @cc [owner:Nils-Fedrigo,label:product] hosting-region-only-when-guaranteed
 * `modelProps.hostingRegion` is the current cell's region when the workspace
 * runs models on Dust-managed regional hosting, and `null` otherwise —
 * `use_vertex_for_supported_models` disabled, or a BYOK plan whose models run
 * on the customer's own provider keys.
 */
// The model lists every surface rendering `ModelPickerContent` offers, and what
// the member is allowed to pick from them.
export function useModelPickerModels({
  owner,
  disabled,
  mode = "select",
  modelIds,
  showDegradations = true,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  mode?: ModelPickerMenuMode;
  // When set, the menu offers exactly these models instead of the workspace
  // catalog.
  modelIds?: string[];
  // Degradation badges warn about picking a model to chat with right now;
  // surfaces configuring a durable default (the agent builder) turn them off.
  showDegradations?: boolean;
}) {
  const { hasFeature } = useFeatureFlags();
  const { subscription } = useAuth();
  const canSelectPremiumModels =
    isCreditPricedPlan(subscription.plan) ||
    subscription.plan.hasAdvancedModelAccess ||
    hasFeature("claude_4_5_opus_feature");
  const isFilterMode = mode === "filter";
  const lockPremiumEfforts = !canSelectPremiumModels;

  const {
    models,
    streams,
    degradedModelIds: allDegradedModelIds,
    isModelsLoading,
  } = useModels({
    owner,
    disabled,
  });
  const degradedModelIds = showDegradations
    ? allDegradedModelIds
    : EMPTY_DEGRADED_MODEL_IDS;

  // The region whose flag the picker shows next to the models hosted there. EU
  // customers rely on it to self-verify data residency: the "EU-hosted models
  // only" toggle already hard-filters the catalog, so the flag is reassurance
  // rather than enforcement.
  const { cellInfo } = useCellContext();
  const hostingRegion =
    hasFeature("use_vertex_for_supported_models") && !subscription.plan.isByok
      ? cellInfo.region
      : null;

  // Concrete models (meta-models are surfaced as tiers instead).
  const allModels = useMemo<ModelConfigurationType[]>(() => {
    if (!modelIds) {
      return models.filter(
        (model) =>
          !isModelStreamId(model.modelId) &&
          (isFilterMode || model.isSelectable)
      );
    }

    const wanted = new Set(modelIds.filter((id) => !isModelStreamId(id)));
    const enabledById = new Map(models.map((model) => [model.modelId, model]));
    // Walk the catalog rather than `modelIds` so maker grouping and ordering
    // stay stable whatever set of agents happens to exist.
    const fromCatalog = getSupportedModelConfigs().filter((model) =>
      wanted.has(model.modelId)
    );
    const known = new Set(fromCatalog.map((model) => model.modelId));

    return [
      ...fromCatalog.map((model) => enabledById.get(model.modelId) ?? model),
      ...models.filter(
        (model) => wanted.has(model.modelId) && !known.has(model.modelId)
      ),
    ];
  }, [models, isFilterMode, modelIds]);

  const tiers = useMemo(() => {
    if (!modelIds) {
      return MODEL_TIERS;
    }
    const wanted = new Set(modelIds);
    return MODEL_TIERS.filter((tier) => wanted.has(tier.metaModelId));
  }, [modelIds]);

  // Meta-models backing the tier rows: their `isSelectable` tells whether the
  // member's model-tier cap allows the stream at all.
  const streamModels = useMemo(
    () => models.filter((model) => isModelStreamId(model.modelId)),
    [models]
  );

  // Group models by maker, preserving first-seen order of both makers and
  // models within each maker.
  const makerGroups = useMemo<MakerGroup[]>(() => {
    const groups = new Map<ModelMakerIdType, ModelConfigurationType[]>();
    for (const model of allModels) {
      const makerId = getModelMaker(model);
      const existing = groups.get(makerId);
      if (existing) {
        existing.push(model);
      } else {
        groups.set(makerId, [model]);
      }
    }
    return Array.from(groups.entries()).map(([makerId, makerModels]) => ({
      makerId,
      models: makerModels,
    }));
  }, [allModels]);

  return {
    modelProps: {
      lockPremiumEfforts,
      ignoreTierRestrictions: isFilterMode,
      tiers,
      degradedModelIds,
      hostingRegion,
      makerGroups,
      allModels,
      streamModels,
      streams,
    },
    models,
    allModels,
    streamModels,
    degradedModelIds,
    isModelsLoading,
    lockPremiumEfforts,
  };
}
