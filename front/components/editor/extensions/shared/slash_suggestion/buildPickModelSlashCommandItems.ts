import type { SelectModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import { SELECT_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import {
  matchesSearchWords,
  splitSearchWords,
} from "@app/components/editor/extensions/shared/slash_suggestion/slashSuggestionUtils";
import { MODEL_TIER_ICON } from "@app/components/model_picker/modelPickerIcons";
import type { Selection } from "@app/components/model_picker/modelPickerUtils";
import {
  buildModelSelection,
  buildTierSelection,
  getEffortStops,
  getInitialEffort,
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

// Tier rows match on their name only.
function getSearchableText(item: SelectModelSlashCommand): string {
  return item.data.selection.display.kind === "tier"
    ? item.label
    : `${item.label} ${item.description ?? ""}`;
}

/**
 * @cc [owner:PopDaph,label:product] default-row-is-model-default-effort
 * Returns the id of the row for the first model in `items` at its initial effort
 * (`getInitialEffort`), or `null` when `items` does not start with a model row.
 */
export function getDefaultPickModelSlashCommandItemId(
  items: SelectModelSlashCommand[],
  { lockPremiumEfforts }: { lockPremiumEfforts: boolean }
): string | null {
  const display = items[0]?.data.selection.display;
  if (!display || display.kind !== "model") {
    return null;
  }

  const effort = getInitialEffort(display.model, { lockPremiumEfforts });
  const defaultItem = items.find((item) => {
    const candidate = item.data.selection.display;
    return (
      candidate.kind === "model" &&
      candidate.model.modelId === display.model.modelId &&
      candidate.effort === effort
    );
  });

  return defaultItem?.id ?? null;
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

/**
 * @cc [owner:PopDaph,label:product] query-filters-rows-by-word-prefix
 * An item is kept only if `query` matches (`matchesSearchWords`) its label, extended with its
 * provider description for model rows; tier rows never match on their description.
 */
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
  const queryWords = splitSearchWords(query);
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

  return items.filter((item) =>
    matchesSearchWords(getSearchableText(item), queryWords)
  );
}
