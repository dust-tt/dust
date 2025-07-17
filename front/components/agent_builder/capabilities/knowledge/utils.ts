import type { ContentNodesViewType } from "@dust-tt/client";
import {
  ActionIncludeIcon,
  ActionScanIcon,
  MagnifyingGlassIcon,
  TableIcon,
} from "@dust-tt/sparkle";

import type {
  AgentBuilderAction,
  CapabilityFormData,
  KnowledgeServerName,
} from "@app/components/agent_builder/types";
import { DESCRIPTION_MAX_LENGTH } from "@app/components/agent_builder/types";
import type { DataSourceViewSelectionConfigurations } from "@app/types";

export interface CapabilityConfig {
  name: KnowledgeServerName;
  title: string;
  description: string;
  icon: React.ComponentType;
  viewType: ContentNodesViewType;
  actionType: AgentBuilderAction["type"];
  actionName: string;
  configPageTitle: string;
  configPageDescription: string;
  hasTimeFrame: boolean;
  hasJsonSchema: boolean;
  descriptionConfig: {
    title: string;
    description: string;
    placeholder: string;
    helpText?: string;
    maxLength?: number;
  };
}

export const CAPABILITY_CONFIGS: Record<KnowledgeServerName, CapabilityConfig> =
  {
    search: {
      name: "search",
      title: "Select Data Sources",
      description: "Choose which data sources to search",
      icon: MagnifyingGlassIcon,
      viewType: "document",
      actionType: "SEARCH",
      actionName: "Search",
      configPageTitle: "Configure Search",
      configPageDescription: "Describe what you want to search for",
      hasTimeFrame: false,
      hasJsonSchema: false,
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
      name: "include_data",
      title: "Select Data Sources",
      description: "Choose which data sources to include data from",
      icon: ActionIncludeIcon,
      viewType: "document",
      actionType: "INCLUDE_DATA",
      actionName: "Include Data",
      configPageTitle: "Configure Include Data",
      configPageDescription: "Set time range and describe what data to include",
      hasTimeFrame: true,
      hasJsonSchema: false,
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
      name: "extract_data",
      title: "Data Sources",
      description: "Choose which data sources to extract data from",
      icon: ActionScanIcon,
      viewType: "document",
      actionType: "EXTRACT_DATA",
      actionName: "Extract Data",
      configPageTitle: "Configure Extract Data",
      configPageDescription:
        "Set extraction parameters and describe what data to extract",
      hasTimeFrame: true,
      hasJsonSchema: true,
      descriptionConfig: {
        title: "What's the data?",
        description:
          "Provide a brief description (maximum 800 characters) of the data content and context to help the agent determine when to utilize it effectively.",
        placeholder: "This data contains…",
        maxLength: DESCRIPTION_MAX_LENGTH,
      },
    },
    query_tables: {
      name: "query_tables",
      title: "Select Tables",
      description: "Choose which tables to query from your data sources",
      icon: TableIcon,
      viewType: "table",
      actionType: "SEARCH",
      actionName: "Query Tables",
      configPageTitle: "Configure Query Tables",
      configPageDescription:
        "Describe how you want to query the selected tables",
      hasTimeFrame: false,
      hasJsonSchema: false,
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

export function generateActionFromFormData({
  config,
  formData,
  dataSourceConfigurations,
  actionId,
}: {
  config: CapabilityConfig;
  formData: CapabilityFormData;
  dataSourceConfigurations: DataSourceViewSelectionConfigurations;
  actionId?: string;
}) {
  let newAction: AgentBuilderAction;

  switch (config.actionType) {
    case "SEARCH":
      newAction = {
        id: actionId || `${config.name}_${Date.now()}`,
        type: "SEARCH",
        name: config.actionName,
        description: formData.description,
        configuration: {
          type: "SEARCH",
          dataSourceConfigurations,
        },
        noConfigurationRequired: false,
      };
      break;
    case "INCLUDE_DATA":
      newAction = {
        id: actionId || `include_data_${Date.now()}`,
        type: "INCLUDE_DATA",
        name: config.actionName,
        description: formData.description,
        configuration: {
          type: "INCLUDE_DATA",
          dataSourceConfigurations,
          timeFrame: formData.timeFrame,
        },
        noConfigurationRequired: false,
      };
      break;
    case "EXTRACT_DATA":
      newAction = {
        id: actionId || `extract_data_${Date.now()}`,
        type: "EXTRACT_DATA",
        name: config.actionName,
        description: formData.description,
        configuration: {
          type: "EXTRACT_DATA",
          dataSourceConfigurations,
          timeFrame: formData.timeFrame,
          jsonSchema: formData.jsonSchema,
        },
        noConfigurationRequired: false,
      };
      break;
    default:
      return;
  }

  return newAction;
}
