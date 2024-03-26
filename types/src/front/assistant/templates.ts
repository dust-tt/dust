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

interface AssistantTemplateTag {
  name: AssistantTemplateTagNameType;
  description: string;
  visual: {
    backgroundColor: string;
    emoji: string;
  };
}

export const assistantTemplateTags: Record<
  AssistantTemplateTagNameType,
  AssistantTemplateTag
> = {
  Featured: {
    name: "Featured",
    description: "Boost productivity with our top-rated templates.",
    visual: {
      backgroundColor: "bg-red-100",
      emoji: "🫶",
    },
  },
  Productivity: {
    name: "Productivity",
    description: "Templates to help you get things done.",
    visual: {
      backgroundColor: "bg-yellow-100",
      emoji: "🚀",
    },
  },
  Design: {
    name: "Design",
    description: "Beautiful templates to inspire your creativity.",
    visual: {
      backgroundColor: "bg-blue-100",
      emoji: "🎨",
    },
  },
} as const;

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
  name: NonEmptyString,
  description: t.union([t.string, t.undefined]),
  presetHandle: t.union([t.string, t.undefined]),
  presetInstructions: t.union([t.string, t.undefined]),
  presetModel: t.string,
  presetTemperature: AssistantCreativityLevelCodec,
  presetAction: ActionPresetCodec,
  helpInstructions: t.union([t.string, t.undefined]),
  helpActions: t.union([t.string, t.undefined]),
  tags: nonEmptyArray(t.string),
});

export type CreateTemplateFormType = t.TypeOf<typeof CreateTemplateFormSchema>;
