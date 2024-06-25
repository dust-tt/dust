import type {
  AgentActionConfigurationType,
  AgentActionSpecification,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  Result,
} from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

export interface BaseActionConfigurationServerRunnerConstructor<
  T extends BaseActionConfigurationServerRunner<V>,
  V extends AgentActionConfigurationType,
> {
  new (actionConfiguration: V): T;
}

export interface BaseActionConfigurationStaticMethods<
  T extends BaseActionConfigurationServerRunner<V>,
  V extends AgentActionConfigurationType,
> {
  fromActionConfiguration(
    this: BaseActionConfigurationServerRunnerConstructor<T, V>,
    actionConfiguration: V
  ): T;

  // Other methods.
}

export interface BaseActionRunParams {
  agentConfiguration: AgentConfigurationType;
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  rawInputs: Record<
    string,
    string | boolean | number | string[] | boolean[] | number[]
  >;
  functionCallId: string | null;
  step: number;
}

export abstract class BaseActionConfigurationServerRunner<
  T extends AgentActionConfigurationType,
> {
  constructor(protected readonly actionConfiguration: T) {}

  static fromActionConfiguration<
    T extends BaseActionConfigurationServerRunner<V>,
    V extends AgentActionConfigurationType,
  >(
    this: BaseActionConfigurationServerRunnerConstructor<T, V>,
    actionConfiguration: V
  ) {
    return new this(actionConfiguration);
  }

  // Action rendering.
  abstract buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string | null; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>>;

  // Action execution.
  abstract run(
    auth: Authenticator,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown>;
}
