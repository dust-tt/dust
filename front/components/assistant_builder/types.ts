import type {
  AgentConfigurationScope,
  AppType,
  DataSourceType,
  SupportedModel,
  TimeframeUnit,
} from "@dust-tt/types";

export const ACTION_MODES = [
  "GENERIC",
  "RETRIEVAL_SEARCH",
  "RETRIEVAL_EXHAUSTIVE",
  "DUST_APP_RUN",
  "TABLES_QUERY",
] as const;

export type ActionMode = (typeof ACTION_MODES)[number];

export type AssistantBuilderDataSourceConfiguration = {
  dataSource: DataSourceType;
  selectedResources: Record<string, string>;
  isSelectAll: boolean;
};

export type AssistantBuilderDustAppConfiguration = {
  app: AppType;
};

export type AssistantBuilderTableConfiguration = {
  dataSourceId: string;
  workspaceId: string;
  tableId: string;
  tableName: string;
};

// Builder State
export type AssistantBuilderState = {
  actionMode: ActionMode;
  dataSourceConfigurations: Record<
    string,
    AssistantBuilderDataSourceConfiguration
  >;
  timeFrame: {
    value: number;
    unit: TimeframeUnit;
  };
  dustAppConfiguration: AssistantBuilderDustAppConfiguration | null;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
  handle: string | null;
  description: string | null;
  scope: Exclude<AgentConfigurationScope, "global">;
  instructions: string | null;
  avatarUrl: string | null;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  };
};

export type AssistantBuilderInitialState = {
  actionMode: AssistantBuilderState["actionMode"];
  dataSourceConfigurations:
    | AssistantBuilderState["dataSourceConfigurations"]
    | null;
  timeFrame: AssistantBuilderState["timeFrame"] | null;
  dustAppConfiguration: AssistantBuilderState["dustAppConfiguration"];
  tablesQueryConfiguration: AssistantBuilderState["tablesQueryConfiguration"];
  handle: string;
  description: string;
  scope: Exclude<AgentConfigurationScope, "global">;
  instructions: string;
  avatarUrl: string | null;
  generationSettings: {
    modelSettings: SupportedModel;
    temperature: number;
  } | null;
};
