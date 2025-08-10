import {
  ActionIncludeIcon,
  ActionScanIcon,
  MagnifyingGlassIcon,
  TableIcon,
} from "@dust-tt/sparkle";

import { DESCRIPTION_MAX_LENGTH } from "@app/components/agent_builder/types";

export interface CapabilityConfig {
  icon: React.ComponentType;
  configPageTitle: string;
  configPageDescription: string;
  descriptionConfig: {
    title: string;
    description: string;
    placeholder: string;
    helpText?: string;
    maxLength?: number;
  };
}

export const CAPABILITY_CONFIGS: Record<string, CapabilityConfig> = {
  search: {
    icon: MagnifyingGlassIcon,
    configPageTitle: "Configure Search",
    configPageDescription: "Describe what you want to search for",
    descriptionConfig: {
      title: "Search Description",
      description:
        "Describe what you want to search for in your selected data sources.",
      placeholder: "Describe what you want to search for...",
      helpText:
        "This description helps the agent understand what to search for.",
    },
  },
  include_data: {
    icon: ActionIncludeIcon,
    configPageTitle: "Configure Include Data",
    configPageDescription: "Set time range and describe what data to include",
    descriptionConfig: {
      title: "Data Description",
      description:
        "Describe what type of data you want to include from your selected data sources to provide context to the agent.",
      placeholder:
        "Describe what data you want to include from your selected data sources...",
      helpText:
        "This description helps the agent understand what type of data to include as context.",
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
  query_tables: {
    icon: TableIcon,
    configPageTitle: "Configure Query Tables",
    configPageDescription: "Describe how you want to query the selected tables",
    descriptionConfig: {
      title: "Query Description",
      description:
        "Describe what kind of queries you want to run against your selected tables. The agent will use this context to generate appropriate SQL queries.",
      placeholder: "Describe what you want to query from your tables...",
      helpText:
        "This description helps the agent understand what kind of SQL queries to generate based on your conversation context.",
    },
  },
};
