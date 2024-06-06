import * as t from "io-ts";
import { nonEmptyArray } from "io-ts-types/lib/nonEmptyArray";
import { NonEmptyString } from "io-ts-types/lib/NonEmptyString";

import { assertNever } from "../../shared/utils/assert_never";
import { ioTsEnum } from "../../shared/utils/iots_utils";
import { DustAppRunConfigurationType } from "./actions/dust_app_run";
import { ProcessConfigurationType } from "./actions/process";
import type { TimeframeUnit } from "./actions/retrieval";
import {
  RetrievalConfigurationType,
  TimeframeUnitCodec,
} from "./actions/retrieval";
import { TablesQueryConfigurationType } from "./actions/tables_query";
import { WebsearchConfigurationType } from "./actions/websearch";
import { AgentAction, AgentActionConfigurationType } from "./agent";
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
  process_configuration: "Extract data",
  websearch_configuration: "Web search",
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
  timeFrameDuration: t.union([t.string, t.undefined]),
  timeFrameUnit: t.union([TimeframeUnitCodec, t.literal(""), t.undefined]),
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

export function getAgentActionConfigurationType(
  action: ActionPreset,
  timeFrameDuration?: number | null,
  timeFrameUnit?: TimeframeUnit | null
): AgentActionConfigurationType | null {
  switch (action) {
    case "reply":
      return null;

    case "retrieval_configuration":
      return {
        dataSources: [],
        id: -1,
        query: "auto",
        relativeTimeFrame: "auto",
        sId: "template",
        topK: "auto",
        type: "retrieval_configuration",
        name: "search_data_sources",
        description: "Search the workspace's internal data sources.",
      } satisfies RetrievalConfigurationType;

    case "tables_query_configuration":
      return {
        id: -1,
        sId: "template",
        tables: [],
        type: "tables_query_configuration",
        name: "query_tables",
        description: "Query the workspace's internal tables.",
      } satisfies TablesQueryConfigurationType;

    case "dust_app_run_configuration":
      return {
        id: -1,
        sId: "template",
        type: "dust_app_run_configuration",
        appWorkspaceId: "template",
        appId: "template",
        name: "run_dust_app",
        description: "Run a Dust app.",
      } satisfies DustAppRunConfigurationType;

    case "process_configuration":
      return {
        dataSources: [],
        id: -1,
        tagsFilter: null,
        relativeTimeFrame: {
          duration: timeFrameDuration || 1,
          unit: timeFrameUnit || "day",
        },
        sId: "template",
        schema: [],
        type: "process_configuration",
        name: "process_data_sources",
        description: "Process the workspace's internal data sources.",
      } satisfies ProcessConfigurationType;

    case "websearch_configuration":
      return {
        id: -1,
        sId: "template",
        type: "websearch_configuration",
        name: "web_search",
        description: "Search the web.",
      } satisfies WebsearchConfigurationType;

    default:
      assertNever(action);
  }
}
