import type { SelectModelSlashCommand } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
import { SELECT_MODEL_SLASH_COMMAND_ACTION } from "@app/components/editor/extensions/shared/slash_suggestion/pickModelSlashCommand";
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
  SLIDER_EFFORTS,
} from "@app/components/model_picker/modelPickerUtils";
import { compareForFuzzySort, subFilter } from "@app/lib/utils";
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

// Name searched for a row, without spaces or hyphens so "gpt6" and "glm3" reach "GPT 6" and
// "GLM-5.3".
function getCompactSearchName(item: SelectModelSlashCommand): string {
  const { display } = item.data.selection;
  const name = display.kind === "tier" ? item.label : display.model.displayName;

  return name.toLowerCase().replace(/[\s-]+/g, "");
}

// Whether the model's display name has a word that is an effort name starting with `word`, as
// "Mistral Medium 3.5" does for "me": that word then belongs to the name, not to the effort.
function nameHasEffortWord(
  item: SelectModelSlashCommand,
  word: string
): boolean {
  const { display } = item.data.selection;
  if (display.kind !== "model") {
    return false;
  }

  return display.model.displayName
    .toLowerCase()
    .split(/[\s-]+/)
    .some(
      (nameWord) =>
        SLIDER_EFFORTS.some((candidate) => candidate === nameWord) &&
        nameWord.startsWith(word)
    );
}

function filterAndRankByQuery(
  items: SelectModelSlashCommand[],
  query: string
): SelectModelSlashCommand[] {
  // Hyphens split like spaces so a displayed name such as "GPT-5.4 Mini" can be typed as is.
  const queryWords = query
    .toLowerCase()
    .split(/[\s-]+/)
    .filter((word) => word.length > 0);
  const lastWord = queryWords.at(-1);
  const effort =
    lastWord === undefined
      ? undefined
      : SLIDER_EFFORTS.find((candidate) => candidate.startsWith(lastWord));
  const nameQuery = (effort ? queryWords.slice(0, -1) : queryWords).join("");

  const matching = items.filter((item) => {
    const { display } = item.data.selection;
    // An effort word alone ("m") always filters by effort; only "mistral me" reads it as a name.
    if (
      effort &&
      lastWord !== undefined &&
      queryWords.length > 1 &&
      nameHasEffortWord(item, lastWord)
    ) {
      return subFilter(queryWords.join(""), getCompactSearchName(item));
    }
    if (effort && (display.kind !== "model" || display.effort !== effort)) {
      return false;
    }

    return subFilter(nameQuery, getCompactSearchName(item));
  });
  if (nameQuery.length === 0) {
    return matching;
  }

  return matching.sort((a, b) =>
    compareForFuzzySort(
      nameQuery,
      getCompactSearchName(a),
      getCompactSearchName(b)
    )
  );
}

/**
 * @cc [owner:PopDaph,label:product] default-row-is-model-initial-effort
 * Returns the id of the row for the first model in `items` at its initial effort
 * (`getInitialEffort`, the same rule as the model picker), or `null` when `items` does not start
 * with a model row or holds no row for that model at that effort.
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
      candidate.model.providerId === display.model.providerId &&
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
 * @cc [owner:PopDaph,label:product] query-selects-name-then-effort
 * `query` is split on whitespace and hyphens. When its last word is a prefix of a slider effort
 * (`light`, `medium`, `high`), only model rows at that effort are kept and the other words form
 * the name query, except for models whose display name contains that effort word ("Mistral
 * Medium 3.5"), which are matched on the whole query when other words precede it; otherwise
 * every word does. A row is kept when the name query, joined, is an
 * in-order subsequence (`subFilter`) of its name (tier name or model display name) without
 * spaces or hyphens. Kept rows are ranked with `compareForFuzzySort`, ties keeping catalog order
 * so a model's efforts stay light, medium, high. Descriptions are never searched; an empty query
 * keeps every row.
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

  return filterAndRankByQuery(items, query);
}
