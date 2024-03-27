import * as t from "io-ts";
import { nonEmptyArray } from "io-ts-types/lib/nonEmptyArray";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";

import { ioTsEnum } from "../../shared/utils/iots_utils";
import { AssistantCreativityLevelCodec } from "./builder";

// Keeps the order of tags for UI display purposes.
export const assistantTemplateTagNames = [
  "Featured",
  "Productivity",
  "Design",
  // TODO: Add tag names for templates, here.
] as const;

export type AssistantTemplateTagNameType =
  (typeof assistantTemplateTagNames)[number];

export function isAssistantTemplateTagNameTypeArray(
  value: unknown
): value is AssistantTemplateTagNameType[] {
  return (
    Array.isArray(value) &&
    value.every((v) => assistantTemplateTagNames.includes(v))
  );
}

export const ACTION_PRESETS = [
  "reply",
  "search_datasources",
  "process_datasources",
  "query_tables",
] as const;
export type ActionPreset = (typeof ACTION_PRESETS)[number];
export const ActionPresetCodec = ioTsEnum<ActionPreset>(
  ACTION_PRESETS,
  "ActionPreset"
);

export const TEMPLATE_VISIBILITIES = [
  "draft",
  "published",
  "disabled",
] as const;
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];
export const TemplateVisibilityCodec = ioTsEnum<TemplateVisibility>(
  TEMPLATE_VISIBILITIES,
  "TemplateVisibility"
);

export const CreateTemplateFormSchema = t.type({
  backgroundColor: NonEmptyString,
  description: t.union([t.string, t.undefined]),
  emoji: NonEmptyString,
  handle: NonEmptyString,
  helpActions: t.union([t.string, t.undefined]),
  helpInstructions: t.union([t.string, t.undefined]),
  presetAction: ActionPresetCodec,
  presetInstructions: t.union([t.string, t.undefined]),
  presetModel: t.string,
  presetTemperature: AssistantCreativityLevelCodec,
  tags: nonEmptyArray(t.string),
});

export type CreateTemplateFormType = t.TypeOf<typeof CreateTemplateFormSchema>;
