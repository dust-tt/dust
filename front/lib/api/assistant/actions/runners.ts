import type {
  AgentAction,
  DustAppRunConfigurationType,
  ProcessConfigurationType,
} from "@dust-tt/types";
import type { WebsearchConfigurationType } from "@dust-tt/types/dist/front/assistant/actions/websearch";

import { DustAppRunConfigurationServerRunner } from "@app/lib/api/assistant/actions/dust_app_run";
import { ProcessConfigurationServerRunner } from "@app/lib/api/assistant/actions/process";
import type {
  BaseActionConfigurationServerRunner,
  BaseActionConfigurationServerRunnerConstructor,
  BaseActionConfigurationStaticMethods,
} from "@app/lib/api/assistant/actions/types";
import { WebsearchConfigurationServerRunner } from "@app/lib/api/assistant/actions/websearch";

interface ActionToConfigTypeMap {
  dust_app_run_configuration: DustAppRunConfigurationType;
  process_configuration: ProcessConfigurationType;
  websearch_configuration: WebsearchConfigurationType;
  // Add other configurations once migrated to classes.
}

interface ActionTypeToClassMap {
  dust_app_run_configuration: DustAppRunConfigurationServerRunner;
  process_configuration: ProcessConfigurationServerRunner;
  websearch_configuration: WebsearchConfigurationServerRunner;
}

// Ensure all AgentAction keys are present in ActionToConfigTypeMap.
type EnsureAllAgentActionsAreMapped<
  // TODO(2025-05-22 flav) Remove `Partial` once all actions have been migrated.
  T extends Partial<Record<AgentAction, any>>
> = T;

// Validate the completeness of ActionToConfigTypeMap.
type ValidatedActionToConfigTypeMap =
  EnsureAllAgentActionsAreMapped<ActionToConfigTypeMap>;

// Ensure all class types extend the base class with the appropriate config type
type EnsureClassTypeCompatibility<
  T extends keyof ValidatedActionToConfigTypeMap
> = ActionTypeToClassMap[T] extends BaseActionConfigurationServerRunner<
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
  dust_app_run_configuration: DustAppRunConfigurationServerRunner,
  process_configuration: ProcessConfigurationServerRunner,
  websearch_configuration: WebsearchConfigurationServerRunner,
} as const;

export function getRunnerforActionConfiguration<K extends keyof CombinedMap>(
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
