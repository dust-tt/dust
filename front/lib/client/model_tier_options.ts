import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  isModelsTierName,
  MODELS_TIER_NAMES,
} from "@app/types/assistant/models/model_tiers";
import { formatMaxTierDescription } from "../model_tiers/tier_order";
import { formatModelTiersSummary } from "./model_tiers";

export const INHERIT_MODEL_TIER = "inherit" as const;
export const NO_GROUP_MODEL_TIER = "none" as const;

export type UserModelTierSelection = typeof INHERIT_MODEL_TIER | ModelsTierName;

export type GroupModelTierSelection =
  | typeof NO_GROUP_MODEL_TIER
  | ModelsTierName;

export type ModelTierPickerOption = {
  value: string;
  label: string;
  description?: string;
};

export function getWorkspaceModelTierOptions(): ModelTierPickerOption[] {
  return MODELS_TIER_NAMES.map((tierName) => ({
    value: tierName,
    label: formatModelTiersSummary(tierName),
    description: formatMaxTierDescription(tierName),
  }));
}

export function getGroupModelTierOptions(): ModelTierPickerOption[] {
  return [
    {
      value: NO_GROUP_MODEL_TIER,
      label: "Inherited from workspace",
      description: "",
    },
    ...getWorkspaceModelTierOptions(),
  ];
}

export function getUserModelTierMenuItemsWithSelection({
  selectedValue,
  inheritLabel,
}: {
  selectedValue: UserModelTierSelection;
  inheritLabel: string;
}): { id: string; name: string; description?: string; checked: boolean }[] {
  return [
    {
      id: INHERIT_MODEL_TIER,
      name: inheritLabel,
      checked: selectedValue === INHERIT_MODEL_TIER,
    },
    ...MODELS_TIER_NAMES.map((tierName) => ({
      id: tierName,
      name: formatModelTiersSummary(tierName),
      description: formatMaxTierDescription(tierName),
      checked: selectedValue === tierName,
    })),
  ];
}

export function toUserModelTierSelection(
  value: string
): UserModelTierSelection {
  if (isModelsTierName(value)) {
    return value;
  }
  return INHERIT_MODEL_TIER;
}

export function getModelTierPickerLabel({
  selectedValue,
  options,
}: {
  selectedValue: string;
  options: ModelTierPickerOption[];
}): string {
  return (
    options.find((option) => option.value === selectedValue)?.label ??
    selectedValue
  );
}
