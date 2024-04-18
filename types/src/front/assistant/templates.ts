import * as t from "io-ts";
import { nonEmptyArray } from "io-ts-types/lib/nonEmptyArray";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";

import { ioTsEnum } from "../../shared/utils/iots_utils";
import { AgentAction } from "./agent";
import { AssistantCreativityLevelCodec } from "./builder";

export const TEMPLATES_TAG_CODES = [
  "CONTENT",
  "DATA",
  "DESIGN",
  "ENGINEERING",
  "FINANCE",
  "HIRING",
  "MARKETING",
  "OPERATIONS",
  "PRODUCT",
  "PRODUCT_MANAGEMENT",
  "PRODUCTIVITY",
  "SALES",
  "UX_DESIGN",
  "UX_RESEARCH",
  "WRITING",
] as const;
export type TemplateTagCodeType = (typeof TEMPLATES_TAG_CODES)[number];

export type TemplateTagsType = Record<
  TemplateTagCodeType,
  {
    label: string;
  }
>;

export const TEMPLATES_TAGS_CONFIG: TemplateTagsType = {
  CONTENT: {
    label: "Content",
  },
  DATA: {
    label: "Data",
  },
  DESIGN: {
    label: "Design",
  },
  ENGINEERING: {
    label: "Engineering",
  },
  FINANCE: {
    label: "Finance",
  },
  HIRING: {
    label: "Hiring",
  },
  MARKETING: {
    label: "Marketing",
  },
  OPERATIONS: {
    label: "Operations",
  },
  PRODUCT: {
    label: "Product",
  },
  PRODUCT_MANAGEMENT: {
    label: "Product Management",
  },
  PRODUCTIVITY: {
    label: "Productivity",
  },
  SALES: {
    label: "Sales",
  },
  UX_DESIGN: {
    label: "UX Design",
  },
  UX_RESEARCH: {
    label: "UX Research",
  },
  WRITING: {
    label: "Writing",
  },
};

export function isTemplateTagCodeArray(
  value: unknown
): value is TemplateTagCodeType[] {
  return (
    Array.isArray(value) && value.every((v) => TEMPLATES_TAG_CODES.includes(v))
  );
}

export const ACTION_PRESETS: Record<AgentAction | "reply", string> = {
  reply: "Reply only",
  dust_app_run_configuration: "Run Dust app",
  retrieval_configuration: "Search data sources",
  tables_query_configuration: "Query tables",
} as const;
export type ActionPreset = keyof typeof ACTION_PRESETS;
export const ActionPresetCodec = ioTsEnum<ActionPreset>(
  Object.keys(ACTION_PRESETS),
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

const TemplateTagCodeTypeCodec = t.keyof({
  ...TEMPLATES_TAGS_CONFIG,
});

export const CreateTemplateFormSchema = t.type({
  backgroundColor: NonEmptyString,
  description: t.union([t.string, t.undefined]),
  emoji: NonEmptyString,
  handle: NonEmptyString,
  helpActions: t.union([t.string, t.undefined]),
  helpInstructions: t.union([t.string, t.undefined]),
  presetAction: ActionPresetCodec,
  presetInstructions: t.union([t.string, t.undefined]),
  presetModelId: t.string,
  presetTemperature: AssistantCreativityLevelCodec,
  tags: nonEmptyArray(TemplateTagCodeTypeCodec),
  visibility: TemplateVisibilityCodec,
});

export type CreateTemplateFormType = t.TypeOf<typeof CreateTemplateFormSchema>;

const TAILWIND_COLOR_NAMES = [
  "amber",
  "black",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "stone",
  "teal",
  "violet",
  "white",
  "yellow",
];
const TAILWIND_COLOR_SHADES = [
  "50",
  "100",
  "200",
  "300",
  "400",
  "500",
  "600",
  "700",
  "800",
  "900",
];

export const generateTailwindBackgroundColors = (): string[] => {
  const tailwindColors: string[] = [];
  TAILWIND_COLOR_NAMES.forEach((color) => {
    TAILWIND_COLOR_SHADES.forEach((shade) => {
      tailwindColors.push(`bg-${color}-${shade}`);
    });
  });
  return tailwindColors;
};
