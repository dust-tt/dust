import * as t from "io-ts";

// Keeps the order of tags for UI display purposes.
export const assistantTemplateTagNames = [
  "Featured",
  "Productivity",
  "Design",
  // TODO: Add tag names for templates, here.
] as const;

export type AssistantTemplateTagNameType =
  (typeof assistantTemplateTagNames)[number];

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

export const TemperaturePresetSchema = t.union([
  t.literal("deterministic"),
  t.literal("factual"),
  t.literal("balanced"),
  t.literal("creative"),
]);
export type TemperaturePreset = t.TypeOf<typeof TemperaturePresetSchema>;

export const ActionPresetSchema = t.union([
  t.literal("reply"),
  t.literal("search_datasources"),
  t.literal("process_datasources"),
  t.literal("query_tables"),
]);
export type ActionPreset = t.TypeOf<typeof ActionPresetSchema>;

export const TemplateVisibilitySchema = t.union([
  t.literal("draft"),
  t.literal("published"),
  t.literal("disabled"),
]);
export type TemplateVisibility = t.TypeOf<typeof TemplateVisibilitySchema>;
