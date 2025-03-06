import type {
  ActionConfigurationType,
  AgentActionSpecification,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  Result,
} from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";

export interface BaseActionConfigurationServerRunnerConstructor<
  T extends BaseActionConfigurationServerRunner<V>,
  V extends ActionConfigurationType,
> {
  new (actionConfiguration: V): T;
}

export interface BaseActionConfigurationStaticMethods<
  T extends BaseActionConfigurationServerRunner<V>,
  V extends ActionConfigurationType,
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
  T extends ActionConfigurationType,
> {
  constructor(protected readonly actionConfiguration: T) {}

  static fromActionConfiguration<
    T extends BaseActionConfigurationServerRunner<V>,
    V extends ActionConfigurationType,
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

  /**
   * Returns a list of supporting actions that should be made available to the model alongside this action.
   * These actions provide additional functionality that can be useful when using this action,
   * but they are not required - the model may choose to use them or not.
   *
   * For example, a retrieval action with auto tags may return a search_tags action
   * to help the model find relevant tags, but the model can still use the retrieval
   * action without searching for tags first.
   */
  getSupportingActions(): ActionConfigurationType[] {
    // By default, no supporting actions are returned.
    return [];
  }

  // Action execution.
  abstract run(
    auth: Authenticator,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown>;
}
