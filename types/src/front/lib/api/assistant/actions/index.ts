import {
  AgentActionConfigurationType,
  AgentActionSpecification,
  AgentConfigurationType,
} from "../../../../../front/assistant/agent";
import {
  AgentMessageType,
  ConversationType,
} from "../../../../../front/assistant/conversation";
import { ModelId } from "../../../../../shared/model_id";
import { Result } from "../../../../../shared/result";
import {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelMessageType,
} from "../generation";

/**
 * Base action.
 */

type BaseActionType =
  | "dust_app_run_action"
  | "tables_query_action"
  | "retrieval_action"
  | "process_action";

export abstract class BaseAction {
  readonly id: ModelId;
  readonly type: BaseActionType;

  constructor(id: ModelId, type: BaseActionType) {
    this.id = id;
    this.type = type;
  }

  abstract renderForModel(): ModelMessageType;
  abstract renderForFunctionCall(): FunctionCallType;
  abstract renderForMultiActionsModel(): FunctionMessageTypeModel;
}

/**
 * Base action configuration.
 */
const BASE_ACTION_CONFIGURATION_TYPES = [
  "dust_app_run_configuration",
  "process_configuration",
  "retrieval_configuration",
  "tables_query_configuration",
] as const;

// Define the ActionType type from the available actions
export type BaseActionConfigurationType =
  (typeof BASE_ACTION_CONFIGURATION_TYPES)[number];

export type BaseActionRunParams = {
  agentConfiguration: AgentConfigurationType;
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  rawInputs: Record<string, string | boolean | number>;
  functionCallId: string | null;
  step: number;
};

export abstract class BaseActionConfiguration<
  T extends AgentActionConfigurationType
> {
  readonly id: ModelId;
  readonly sId: string;
  readonly type: BaseActionConfigurationType;
  readonly name: string | null;
  readonly description: string | null;
  readonly forceUseAtIteration: number | null;

  constructor(t: T) {
    this.id = t.id;
    this.sId = t.sId;
    this.type = t.type;
    this.name = t.name;
    this.description = t.description;
    this.forceUseAtIteration = t.forceUseAtIteration;
  }

  // Action rendering. (unknown for Authenticator - temporary solution until we move back this to Front)
  abstract buildSpecification(
    K: unknown,
    { name, description }: { name?: string; description?: string }
  ): Promise<Result<AgentActionSpecification, Error>>;

  // Action execution.
  abstract run(
    K: unknown,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown>;
}
