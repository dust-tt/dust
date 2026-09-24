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
  isModelLocked,
  MODEL_TIERS,
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
import { REASONING_EFFORT_LABELS } from "@app/types/assistant/models/reasoning";
import type { ReasoningEffort } from "@app/types/assistant/models/types";
import type { ComponentType } from "react";

// Match the model picker's effort slider: one row per selectable stop, or a
// single `none` row for non-reasoning models that have no slider stops.
export function getSelectableEffortsForSlashMenu(
  model: EnabledModelConfigurationType,
  { lockPremiumEfforts }: { lockPremiumEfforts: boolean }
): ReasoningEffort[] {
  if (isModelLocked(model, { lockPremiumEfforts })) {
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

// Whether `queryWords` also read as a name for this model: the last word, two letters or more,
// starts a name word that no earlier query word starts, as "mini" does in "gpt mini" for
// "GPT-5 Mini" ("mistral mi" does not count "mistral").
function queryMatchesAsName(
  item: SelectModelSlashCommand,
  queryWords: string[]
): boolean {
  const { display } = item.data.selection;
  const lastWord = queryWords.at(-1);
  if (
    display.kind !== "model" ||
    queryWords.length < 2 ||
    lastWord === undefined ||
    lastWord.length < 2
  ) {
    return false;
  }

  const earlierWords = queryWords.slice(0, -1);
  const lastWordStartsNameWord = display.model.displayName
    .toLowerCase()
    .split(/[\s-]+/)
    .some(
      (nameWord) =>
        nameWord.startsWith(lastWord) &&
        !earlierWords.some((word) => nameWord.startsWith(word))
    );

  return (
    lastWordStartsNameWord &&
    subFilter(queryWords.join(""), getCompactSearchName(item))
  );
}

// Efforts match on a prefix of their value or label; ties go to the earliest one here, so "m" is
// medium and "mi" or "ma" reach minimal or maximal.
const EFFORT_PREFIX_PRIORITY: readonly ReasoningEffort[] = [
  "low",
  "medium",
  "high",
  "none",
  "xhigh",
  "minimal",
  "maximal",
];

function getEffortForQueryWord(word: string): ReasoningEffort | undefined {
  return EFFORT_PREFIX_PRIORITY.find(
    (effort) =>
      effort.startsWith(word) ||
      REASONING_EFFORT_LABELS[effort].toLowerCase().startsWith(word)
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
    lastWord === undefined ? undefined : getEffortForQueryWord(lastWord);
  const nameQuery = (effort ? queryWords.slice(0, -1) : queryWords).join("");
  if (!effort) {
    return rankByName(
      items.filter((item) => subFilter(nameQuery, getCompactSearchName(item))),
      nameQuery
    );
  }

  const nameMatches = items.filter((item) =>
    queryMatchesAsName(item, queryWords)
  );
  const effortMatches = items.filter((item) => {
    const { display } = item.data.selection;
    return (
      display.kind === "model" &&
      display.effort === effort &&
      !nameMatches.includes(item) &&
      subFilter(nameQuery, getCompactSearchName(item))
    );
  });

  return [
    ...rankByName(nameMatches, queryWords.join("")),
    ...rankByName(effortMatches, nameQuery),
  ];
}

function rankByName(
  items: SelectModelSlashCommand[],
  nameQuery: string
): SelectModelSlashCommand[] {
  if (nameQuery.length === 0) {
    return items;
  }

  return items.sort((a, b) =>
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
 * `query` is split on whitespace and hyphens. A row's name is its tier name or model display name
 * without spaces or hyphens; a query "matches" a name when, joined, it is an in-order subsequence
 * (`subFilter`) of it. When the last word is a prefix of an effort's value or label (ties resolved
 * low, medium, high, none, xhigh, minimal, maximal, so "m" is medium), a model row is kept when
 * the other words match its name and it is at that effort, or, with more than one word, when the
 * last word (two letters or more) starts a word of its display name that no earlier query word
 * starts and the whole query matches its name ("gpt mini" keeps every GPT-5 Mini effort). Those
 * name matches rank first. Without an effort word, a row is kept when every word matches its
 * name. Each group is ranked with `compareForFuzzySort`, ties keeping catalog order so a model's
 * efforts stay in slider order. Descriptions are never searched; an empty query keeps every row.
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
