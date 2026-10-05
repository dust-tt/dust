import { z } from "zod";

import { TimeframeUnitSchema } from "../shared/utils/time_frame";

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

export type TemplateInfo = {
  templateId: string;
  sidekickInstructions: string | null;
};

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

const TemplateTagCodeTypeSchema = z.enum(TEMPLATES_TAG_CODES);

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
const MultiActionPresetSchema = z.enum(
  Object.keys(MULTI_ACTION_PRESETS) as [
    MultiActionPreset,
    ...MultiActionPreset[],
  ]
);
const TemplateActionPresetSchema = z.object({
  type: MultiActionPresetSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  help: z.string().min(1),
});

export type TemplateActionPreset = z.infer<typeof TemplateActionPresetSchema>;

// VISIBILITY

export const TEMPLATE_VISIBILITIES = [
  "draft",
  "published",
  "disabled",
] as const;
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];
const TemplateVisibilitySchema = z.enum(TEMPLATE_VISIBILITIES);

// FORM SCHEMA

export const CreateTemplateFormSchema = z.object({
  backgroundColor: z.string().min(1),
  userFacingDescription: z.string().optional(),
  agentFacingDescription: z.string().optional(),
  emoji: z.string().min(1),
  handle: z.string().min(1),
  timeFrameDuration: z.string().optional(),
  timeFrameUnit: z.union([TimeframeUnitSchema, z.literal("")]).optional(),
  helpActions: z.string().optional(),
  helpInstructions: z.string().optional(),
  sidekickInstructions: z.string().optional(),
  presetActions: z.array(TemplateActionPresetSchema),
  presetInstructions: z.string().optional(),
  presetModelId: z.string(),
  tags: z.array(TemplateTagCodeTypeSchema).min(1),
  visibility: TemplateVisibilitySchema,
});

export type CreateTemplateFormType = z.infer<typeof CreateTemplateFormSchema>;
