import type { SelectModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import { SELECT_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import type { SlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  getEffortStops,
  getModelWithReasoningEffortLabel,
  getTierLockReason,
  getTierResolvedModelLabel,
  isPremiumModel,
  MODEL_TIERS,
} from "@app/components/model_picker/modelPickerUtils";
import type {
  EnabledModelConfigurationType,
  ModelStreamResolutionsType,
} from "@app/types/api/assistant/models";
import { isModelStreamId } from "@app/types/assistant/models/auto";
import {
  getModelMaker,
  getModelMakerDisplayName,
} from "@app/types/assistant/models/providers";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import type { ComponentType } from "react";

// Match the model picker's effort slider: light/medium/high only. `none` is not
// a selectable effort row for reasoning models — it only appears as the single
// row for non-reasoning models that have no slider stops.
export function getSelectableEffortsForSlashMenu(
  model: EnabledModelConfigurationType,
  { lockPremiumEfforts }: { lockPremiumEfforts: boolean }
): ReasoningEffort[] {
  if (isPremiumModel(model, { lockPremiumEfforts })) {
    return [];
  }

  const selectableEfforts = getEffortStops(model, { lockPremiumEfforts })
    .filter((stop) => stop.unavailabilityReason === null)
    .map((stop) => stop.effort);

  if (selectableEfforts.length > 0) {
    return selectableEfforts;
  }

  return ["none"];
}

function matchesQuery(item: SlashCommand, normalizedQuery: string): boolean {
  if (normalizedQuery.length === 0) {
    return true;
  }

  return [item.label, item.description]
    .filter((value): value is string => value !== undefined)
    .some((value) => value.toLowerCase().includes(normalizedQuery));
}

function buildTierSlashCommandItems({
  lockPremiumEfforts,
  streamModels,
  streams,
}: {
  lockPremiumEfforts: boolean;
  streamModels: EnabledModelConfigurationType[];
  streams: ModelStreamResolutionsType | null;
}): SelectModelSlashCommand[] {
  const items: SelectModelSlashCommand[] = [];

  for (const tier of MODEL_TIERS) {
    if (getTierLockReason(tier.id, { lockPremiumEfforts, streamModels })) {
      continue;
    }

    const selection: Selection = {
      display: { kind: "tier", tierId: tier.id },
      toSend: buildTierSelection(tier.id),
    };

    items.push({
      action: SELECT_MODEL_SLASH_COMMAND_ACTION,
      data: { selection },
      description: getTierResolvedModelLabel(tier.id, streams),
      icon: MODEL_TIER_ICON[tier.id],
      id: `tier-${tier.id}`,
      label: tier.name,
    });
  }

  return items;
}

export function buildPickModelSlashCommandItems({
  getModelIcon,
  lockPremiumEfforts,
  models,
  query,
  streams,
}: {
  getModelIcon: (model: EnabledModelConfigurationType) => ComponentType;
  lockPremiumEfforts: boolean;
  models: EnabledModelConfigurationType[];
  query: string;
  streams: ModelStreamResolutionsType | null;
}): SelectModelSlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  const selectableModels = models.filter(
    (model) => !isModelStreamId(model.modelId) && model.isSelectable
  );
  const streamModels = models.filter((model) => isModelStreamId(model.modelId));

  const items: SelectModelSlashCommand[] = [
    ...buildTierSlashCommandItems({
      lockPremiumEfforts,
      streamModels,
      streams,
    }),
  ];

  for (const model of selectableModels) {
    const efforts = getSelectableEffortsForSlashMenu(model, {
      lockPremiumEfforts,
    });
    const icon = getModelIcon(model);

    for (const effort of efforts) {
      const selection: Selection = {
        display: { kind: "model", model, effort },
        toSend: buildModelSelection(model, effort),
      };
      const label = getModelWithReasoningEffortLabel(selection.display);

      items.push({
        action: SELECT_MODEL_SLASH_COMMAND_ACTION,
        data: { selection },
        description: getModelMakerDisplayName(getModelMaker(model)),
        icon,
        id: `${model.providerId}/${model.modelId}/${effort}`,
        label,
      });
    }
  }

  return items.filter((item) => matchesQuery(item, normalizedQuery));
}
