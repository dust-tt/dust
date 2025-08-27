import {
  ActionIncludeIcon,
  ActionScanIcon,
  MagnifyingGlassIcon,
  TableIcon,
} from "@dust-tt/sparkle";

import { DESCRIPTION_MAX_LENGTH } from "@app/components/agent_builder/types";
import {
  DATA_WAREHOUSE_SERVER_NAME,
  TABLE_QUERY_SERVER_NAME,
  TABLE_QUERY_V2_SERVER_NAME,
} from "@app/lib/actions/mcp_internal_actions/constants";

export interface CapabilityConfig {
  icon: React.ComponentType;
  configPageTitle: string;
  configPageDescription: string;
  descriptionConfig: {
    title: string;
    description: string;
    placeholder: string;
    maxLength?: number;
  };
}

export const CAPABILITY_CONFIGS: Record<string, CapabilityConfig> = {
  search: {
    icon: MagnifyingGlassIcon,
    configPageTitle: "Configure Search",
    configPageDescription: "Describe what you want to search for",
    descriptionConfig: {
      title: "What’s the data?",
      description:
        "Provide a brief description of the data content and context to help the agent determine when to utilize it effectively.",
      placeholder: "This data contains…",
    },
  },
  include_data: {
    icon: ActionIncludeIcon,
    configPageTitle: "Configure Include Data",
    configPageDescription: "Set time range and describe what data to include",
    descriptionConfig: {
      title: "What’s the data?",
      description:
        "Describe what type of data you want to include from your selected data sources to provide context to the agent.",
      placeholder:
        "Describe what data you want to include from your selected data sources...",
    },
  },
  extract_data: {
    icon: ActionScanIcon,
    configPageTitle: "Configure Extract Data",
    configPageDescription:
      "Set extraction parameters and describe what data to extract",
    descriptionConfig: {
      title: "What’s the data?",
      description:
        "Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively.",
      placeholder: "This data contains…",
      maxLength: DESCRIPTION_MAX_LENGTH,
    },
  },
  [TABLE_QUERY_SERVER_NAME]: {
    icon: TableIcon,
    configPageTitle: "Configure Query Tables",
    configPageDescription: "Describe how you want to query the selected tables",
    descriptionConfig: {
      title: "Query Description",
      description:
        "Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries.",
      placeholder: "Describe what you want to query from your tables...",
    },
  },
  [TABLE_QUERY_V2_SERVER_NAME]: {
    icon: TableIcon,
    configPageTitle: "Configure Query Tables v2",
    configPageDescription: "Describe how you want to query the selected tables",
    descriptionConfig: {
      title: "Query Description",
      description:
        "Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries.",
      placeholder: "Describe what you want to query from your tables...",
    },
  },
  [DATA_WAREHOUSE_SERVER_NAME]: {
    icon: TableIcon,
    configPageTitle: "Configure Data Warehouse",
    configPageDescription: "Describe how you want to query the selected tables",
    descriptionConfig: {
      title: "Query Description",
      description:
        "Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries.",
      placeholder: "Describe what you want to query from your tables...",
    },
  },
};
