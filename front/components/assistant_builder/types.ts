import type {
  AgentConfigurationScope,
  AgentGenerationConfigurationType,
  AgentModelConfigurationType,
  AppType,
  ContentNode,
  DataSourceType,
  TimeframeUnit,
} from "@dust-tt/types";
import { GPT_4_TURBO_MODEL_CONFIG } from "@dust-tt/types";

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
  selectedResources: ContentNode[];
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
  connectorContentNodeInternalId?: string;
};

export type AssistantBuilderDataSourceConfigurations = Record<
  string,
  AssistantBuilderDataSourceConfiguration
>;

// Builder State
export type AssistantBuilderState = {
  actionMode: ActionMode;
  dataSourceConfigurations: AssistantBuilderDataSourceConfigurations;
  timeFrame: {
    value: number;
    unit: TimeframeUnit;
  };
  dustAppConfiguration: AssistantBuilderDustAppConfiguration | null;
  tablesQueryConfiguration: Record<string, AssistantBuilderTableConfiguration>;
  modelConfiguration: AgentModelConfigurationType;
  generationConfiguration: AgentGenerationConfigurationType | null;
  handle: string | null;
  description: string | null;
  scope: Exclude<AgentConfigurationScope, "global">;
  instructions: string | null;
  avatarUrl: string | null;
};

export type AssistantBuilderInitialState = {
  actionMode: AssistantBuilderState["actionMode"];
  dataSourceConfigurations:
    | AssistantBuilderState["dataSourceConfigurations"]
    | null;
  timeFrame: AssistantBuilderState["timeFrame"] | null;
  dustAppConfiguration: AssistantBuilderState["dustAppConfiguration"];
  tablesQueryConfiguration: AssistantBuilderState["tablesQueryConfiguration"];
  modelConfiguration: AssistantBuilderState["modelConfiguration"];
  generationConfiguration: AssistantBuilderState["generationConfiguration"];
  handle: string;
  description: string;
  scope: Exclude<AgentConfigurationScope, "global">;
  avatarUrl: string | null;
  instructions: string;
};

export const DEFAULT_ASSISTANT_STATE: AssistantBuilderState = {
  actionMode: "GENERIC",
  dataSourceConfigurations: {},
  timeFrame: {
    value: 1,
    unit: "month",
  },
  dustAppConfiguration: null,
  tablesQueryConfiguration: {},
  handle: null,
  scope: "private",
  description: null,
  instructions: null,
  avatarUrl: null,
  modelConfiguration: {
    modelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
    providerId: GPT_4_TURBO_MODEL_CONFIG.providerId,
    temperature: 0.7,
  },
  generationConfiguration: {
    forceUseAtIteration: null,
  },
};
