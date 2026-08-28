import type { MakerGroup } from "@app/components/model_picker/modelPickerUtils";
import { MODEL_TIERS } from "@app/components/model_picker/modelPickerUtils";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
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
import { useMemo, useRef, useState } from "react";

// The transient menu state and derived model lists shared by every surface
// rendering `ModelPickerContent`: the input bar, the manage-agents model filter
// and the bulk "Set model" dropdown.
// "select" picks a model to run; "filter" only names one. A filter must reach
// every model an agent can already sit on, so it drops the member's tier and
// plan restrictions instead of padlocking the rows they exclude.
type ModelPickerMenuMode = "select" | "filter";

export function useModelPickerMenu({
  owner,
  disabled,
  mode = "select",
  modelIds,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
  mode?: ModelPickerMenuMode;
  // When set, the menu offers exactly these models instead of the workspace
  // catalog.
  modelIds?: string[];
}) {
  const { hasFeature } = useFeatureFlags();
  const { subscription } = useAuth();
  const canSelectPremiumModels =
    isCreditPricedPlan(subscription.plan) ||
    subscription.plan.hasAdvancedModelAccess ||
    hasFeature("claude_4_5_opus_feature");
  const isFilterMode = mode === "filter";
  const lockPremiumEfforts = !canSelectPremiumModels;

  const { models, streams, isModelsLoading } = useModels({ owner, disabled });

  const [isMakersExpanded, setIsMakersExpanded] = useState(false);

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

  // Picking a concrete model (or nudging its effort slider) must keep the menu
  // and its open submenus visible so the effort can still be adjusted. The
  // click briefly moves focus/pointer in a way Radix treats as an
  // interaction-outside and dismisses the (sub)menu; we record the pick time
  // and veto the close that immediately follows it.
  const lastModelInteractionAtMsRef = useRef(0);
  const shouldBlockDismiss = () =>
    Date.now() - lastModelInteractionAtMsRef.current < 300;
  const noteModelInteraction = () => {
    lastModelInteractionAtMsRef.current = Date.now();
  };

  const resetMenu = () => {
    setIsMakersExpanded(false);
  };

  const menuProps = {
    shouldBlockDismiss,
    lockPremiumEfforts,
    ignoreTierRestrictions: isFilterMode,
    tiers,
    makerGroups,
    streamModels,
    streams,
    isMakersExpanded,
    onToggleMakers: () => setIsMakersExpanded((v) => !v),
  };

  return {
    menuProps,
    models,
    allModels,
    streamModels,
    isModelsLoading,
    lockPremiumEfforts,
    shouldBlockDismiss,
    noteModelInteraction,
    resetMenu,
  };
}
