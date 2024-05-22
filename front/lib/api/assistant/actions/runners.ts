import type { AgentAction, DustAppRunConfigurationType } from "@dust-tt/types";

import { DustAppRunConfigurationServerRunner } from "@app/lib/api/assistant/actions/dust_app_run";
import type { BaseActionConfigurationStaticMethods } from "@app/lib/api/assistant/actions/types";

interface ActionToConfigTypeMap {
  dust_app_run_configuration: DustAppRunConfigurationType;
  // Add other configurations once migrated to classes.
}

interface ActionTypeToClassMap {
  dust_app_run_configuration: DustAppRunConfigurationServerRunner;
}

// Ensure all AgentAction keys are present in ActionToConfigTypeMap.
type EnsureAllAgentActionsAreMapped<
  // TODO(2025-05-22 flav) Remove `Partial` once all actions have been migrated.
  T extends Partial<Record<AgentAction, any>>
> = T;

// Validate the completeness of ActionToConfigTypeMap.
type ValidatedActionToConfigTypeMap =
  EnsureAllAgentActionsAreMapped<ActionToConfigTypeMap>;

export const ACTION_TYPE_TO_CONFIGURATION_SERVER_RUNNER: {
  [K in keyof ValidatedActionToConfigTypeMap]: {
    new (config: ValidatedActionToConfigTypeMap[K]): ActionTypeToClassMap[K];
  } & BaseActionConfigurationStaticMethods<
    ActionTypeToClassMap[K],
    ValidatedActionToConfigTypeMap[K]
  >;
} = {
  dust_app_run_configuration: DustAppRunConfigurationServerRunner,
} as const;
