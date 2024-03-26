// Keeps the order of tags for UI display purposes.
const assistantTemplateTagNames = [
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
