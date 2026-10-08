import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatList } from "@app/lib/i18n/format";
import { expandTiersUpTo } from "@app/lib/model_tiers/tier_order";
import type { ModelsTierName } from "@app/types/assistant/models/model_tiers";
import {
  getModelsTierDisplayName,
  isModelsTierName,
  MODELS_TIER_NAMES,
} from "@app/types/assistant/models/model_tiers";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { formatModelTiersSummary } from "./model_tiers";

type Translate = (descriptor: MessageDescriptor) => string;

export const INHERIT_MODEL_TIER = "inherit" as const;
export const NO_GROUP_MODEL_TIER = "none" as const;

export type UserModelTierSelection = typeof INHERIT_MODEL_TIER | ModelsTierName;

export type ModelTierPickerOption = {
  value: string;
  label: string;
  description?: string;
};

function formatMaxTierDescription(
  maxTierName: ModelsTierName,
  t: Translate
): string | undefined {
  const lowerTiers = expandTiersUpTo(maxTierName).slice(0, -1);
  if (lowerTiers.length === 0) {
    return undefined;
  }

  const tierNames = formatList(
    lowerTiers.map(getModelsTierDisplayName),
    { type: "conjunction" },
    getActiveLocale()
  );
  return t(msg`Includes ${tierNames}`);
}

export function getWorkspaceModelTierOptions(
  t: Translate
): ModelTierPickerOption[] {
  return MODELS_TIER_NAMES.map((tierName) => ({
    value: tierName,
    label: formatModelTiersSummary(tierName, t),
    description: formatMaxTierDescription(tierName, t),
  }));
}

export function getGroupModelTierOptions(
  t: Translate
): ModelTierPickerOption[] {
  return [
    {
      value: NO_GROUP_MODEL_TIER,
      label: t(msg`Inherited from workspace`),
      description: "",
    },
    ...getWorkspaceModelTierOptions(t),
  ];
}

export function getUserModelTierMenuItemsWithSelection({
  selectedValue,
  inheritLabel,
  t,
}: {
  selectedValue: UserModelTierSelection;
  inheritLabel: string;
  t: Translate;
}): { id: string; name: string; description?: string; checked: boolean }[] {
  return [
    {
      id: INHERIT_MODEL_TIER,
      name: inheritLabel,
      checked: selectedValue === INHERIT_MODEL_TIER,
    },
    ...MODELS_TIER_NAMES.map((tierName) => ({
      id: tierName,
      name: formatModelTiersSummary(tierName, t),
      description: formatMaxTierDescription(tierName, t),
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
