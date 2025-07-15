import type { MCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCPConfigurationServerRunner } from "@app/lib/actions/mcp";
import type {
  BaseActionConfigurationServerRunner,
  BaseActionConfigurationServerRunnerConstructor,
  BaseActionConfigurationStaticMethods,
} from "@app/lib/actions/types";
import type { ActionConfigurationType } from "@app/lib/actions/types/agent";

interface ActionToConfigTypeMap {
  mcp_configuration: MCPToolConfigurationType;
}

interface ActionTypeToClassMap {
  mcp_configuration: MCPConfigurationServerRunner;
}

// Ensure all AgentAction keys are present in ActionToConfigTypeMap.
type EnsureAllAgentAreMapped<
  T extends Record<ActionConfigurationType["type"], any>,
> = T;

// Validate the completeness of ActionToConfigTypeMap.
type ValidatedActionToConfigTypeMap =
  EnsureAllAgentAreMapped<ActionToConfigTypeMap>;

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
  mcp_configuration: MCPConfigurationServerRunner,
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
