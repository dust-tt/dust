import type {
  AgentAction,
  BrowseConfigurationType,
  ConversationIncludeFileConfigurationType,
  DustAppRunConfigurationType,
  ProcessConfigurationType,
  ReasoningConfigurationType,
  RetrievalConfigurationType,
  SearchLabelsConfigurationType,
  TablesQueryConfigurationType,
  WebsearchConfigurationType,
} from "@dust-tt/types";

import { BrowseConfigurationServerRunner } from "@app/lib/api/assistant/actions/browse";
import { ConversationIncludeFileConfigurationServerRunner } from "@app/lib/api/assistant/actions/conversation/include_file";
import { DustAppRunConfigurationServerRunner } from "@app/lib/api/assistant/actions/dust_app_run";
import { ProcessConfigurationServerRunner } from "@app/lib/api/assistant/actions/process";
import { ReasoningConfigurationServerRunner } from "@app/lib/api/assistant/actions/reasoning";
import { RetrievalConfigurationServerRunner } from "@app/lib/api/assistant/actions/retrieval";
import { SearchLabelsConfigurationServerRunner } from "@app/lib/api/assistant/actions/search_labels";
import { TablesQueryConfigurationServerRunner } from "@app/lib/api/assistant/actions/tables_query";
import type {
  BaseActionConfigurationServerRunner,
  BaseActionConfigurationServerRunnerConstructor,
  BaseActionConfigurationStaticMethods,
} from "@app/lib/api/assistant/actions/types";
import { WebsearchConfigurationServerRunner } from "@app/lib/api/assistant/actions/websearch";

interface ActionToConfigTypeMap {
  browse_configuration: BrowseConfigurationType;
  conversation_include_file_configuration: ConversationIncludeFileConfigurationType;
  dust_app_run_configuration: DustAppRunConfigurationType;
  process_configuration: ProcessConfigurationType;
  reasoning_configuration: ReasoningConfigurationType;
  retrieval_configuration: RetrievalConfigurationType;
  search_labels_configuration: SearchLabelsConfigurationType;
  tables_query_configuration: TablesQueryConfigurationType;
  websearch_configuration: WebsearchConfigurationType;
}

interface ActionTypeToClassMap {
  browse_configuration: BrowseConfigurationServerRunner;
  conversation_include_file_configuration: ConversationIncludeFileConfigurationServerRunner;
  dust_app_run_configuration: DustAppRunConfigurationServerRunner;
  process_configuration: ProcessConfigurationServerRunner;
  reasoning_configuration: ReasoningConfigurationServerRunner;
  retrieval_configuration: RetrievalConfigurationServerRunner;
  search_labels_configuration: SearchLabelsConfigurationServerRunner;
  tables_query_configuration: TablesQueryConfigurationServerRunner;
  websearch_configuration: WebsearchConfigurationServerRunner;
}

// Ensure all AgentAction keys are present in ActionToConfigTypeMap.
type EnsureAllAgentActionsAreMapped<T extends Record<AgentAction, any>> = T;

// Validate the completeness of ActionToConfigTypeMap.
type ValidatedActionToConfigTypeMap =
  EnsureAllAgentActionsAreMapped<ActionToConfigTypeMap>;

// Ensure all class types extend the base class with the appropriate config type
type EnsureClassTypeCompatibility<
  T extends keyof ValidatedActionToConfigTypeMap,
> =
  ActionTypeToClassMap[T] extends BaseActionConfigurationServerRunner<
    ValidatedActionToConfigTypeMap[T]
  >
    ? ActionTypeToClassMap[T]
    : never;

type CombinedMap = {
  [K in keyof ValidatedActionToConfigTypeMap]: {
    configType: ValidatedActionToConfigTypeMap[K];
    classType: EnsureClassTypeCompatibility<K>;
  };
};

export const ACTION_TYPE_TO_CONFIGURATION_SERVER_RUNNER: {
  [K in keyof CombinedMap]: BaseActionConfigurationServerRunnerConstructor<
    CombinedMap[K]["classType"],
    CombinedMap[K]["configType"]
  > &
    BaseActionConfigurationStaticMethods<
      CombinedMap[K]["classType"],
      CombinedMap[K]["configType"]
    >;
} = {
  browse_configuration: BrowseConfigurationServerRunner,
  conversation_include_file_configuration:
    ConversationIncludeFileConfigurationServerRunner,
  dust_app_run_configuration: DustAppRunConfigurationServerRunner,
  process_configuration: ProcessConfigurationServerRunner,
  reasoning_configuration: ReasoningConfigurationServerRunner,
  retrieval_configuration: RetrievalConfigurationServerRunner,
  search_labels_configuration: SearchLabelsConfigurationServerRunner,
  tables_query_configuration: TablesQueryConfigurationServerRunner,
  websearch_configuration: WebsearchConfigurationServerRunner,
} as const;

export function getRunnerForActionConfiguration<K extends keyof CombinedMap>(
  actionConfiguration: {
    type: K;
  } & CombinedMap[K]["configType"]
): CombinedMap[K]["classType"] {
  const RunnerClass = ACTION_TYPE_TO_CONFIGURATION_SERVER_RUNNER[
    actionConfiguration.type
  ] as BaseActionConfigurationServerRunnerConstructor<
    CombinedMap[K]["classType"],
    CombinedMap[K]["configType"]
  > &
    BaseActionConfigurationStaticMethods<
      CombinedMap[K]["classType"],
      CombinedMap[K]["configType"]
    >;

  return RunnerClass.fromActionConfiguration(actionConfiguration);
}
