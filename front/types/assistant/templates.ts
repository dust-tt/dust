import * as t from "io-ts";
import { nonEmptyArray } from "io-ts-types/lib/nonEmptyArray";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";

import { ioTsEnum } from "../shared/utils/iots_utils";
import { TimeframeUnitCodec } from "../shared/utils/time_frame";

// TAGS

export const TEMPLATES_TAG_CODES = [
  "CONTENT",
  "DATA",
  "DESIGN",
  "ENGINEERING",
  "FINANCE",
  "HIRING",
  "IT",
  "KNOWLEDGE",
  "LEGAL",
  "MARKETING",
  "OPERATIONS",
  "PRODUCT",
  "PRODUCT_MANAGEMENT",
  "PRODUCTIVITY",
  "RECRUITING",
  "SALES",
  "SUPPORT",
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
  IT: {
    label: "IT",
  },
  LEGAL: {
    label: "Legal",
  },
  KNOWLEDGE: {
    label: "Knowledge",
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
  RECRUITING: {
    label: "Recruiting & People",
  },
  SALES: {
    label: "Sales",
  },
  SUPPORT: {
    label: "Support",
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

const TemplateTagCodeTypeCodec = t.keyof({
  ...TEMPLATES_TAGS_CONFIG,
});

// MULTI ACTION MODE

type MultiActionType =
  | "RETRIEVAL_SEARCH"
  | "TABLES_QUERY"
  | "PROCESS"
  | "WEB_NAVIGATION";
export const MULTI_ACTION_PRESETS: Record<MultiActionType, string> = {
  RETRIEVAL_SEARCH: "Search data sources",
  TABLES_QUERY: "Query tables",
  PROCESS: "Extract data",
  WEB_NAVIGATION: "Web navigation",
} as const;
export type MultiActionPreset = keyof typeof MULTI_ACTION_PRESETS;
export const MultiActionPresetCodec = ioTsEnum<MultiActionPreset>(
  Object.keys(MULTI_ACTION_PRESETS),
  "MultiActionPreset"
);
const TemplateActionTypePreset = t.type({
  type: MultiActionPresetCodec,
  name: NonEmptyString,
  description: NonEmptyString,
  help: NonEmptyString,
});

export type TemplateActionPreset = t.TypeOf<typeof TemplateActionTypePreset>;

const TemplateActionsPreset = t.array(TemplateActionTypePreset);

// VISIBILITY

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

// FORM SCHEMA

export const CreateTemplateFormSchema = t.type({
  backgroundColor: NonEmptyString,
  description: t.union([t.string, t.undefined]),
  emoji: NonEmptyString,
  handle: NonEmptyString,
  timeFrameDuration: t.union([t.string, t.undefined]),
  timeFrameUnit: t.union([TimeframeUnitCodec, t.literal(""), t.undefined]),
  helpActions: t.union([t.string, t.undefined]),
  helpInstructions: t.union([t.string, t.undefined]),
  presetActions: TemplateActionsPreset,
  presetInstructions: t.union([t.string, t.undefined]),
  presetModelId: t.string,
  tags: nonEmptyArray(TemplateTagCodeTypeCodec),
  visibility: TemplateVisibilityCodec,
});

export type CreateTemplateFormType = t.TypeOf<typeof CreateTemplateFormSchema>;
