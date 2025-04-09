import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  Result,
  SupportedFileContentType,
  UserMessageType,
} from "@app/types";

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: SupportedFileContentType;
  snippet: string | null;
};

type ConversationBaseActionType =
  | "conversation_list_files_action"
  | "conversation_include_file_action";

type BaseActionType =
  | "browse_action"
  | "dust_app_run_action"
  | "process_action"
  | "reasoning_action"
  | "retrieval_action"
  | "search_labels_action"
  | "tables_query_action"
  | "visualization_action"
  | "websearch_action"
  | "tool_action"
  | ConversationBaseActionType;

export abstract class BaseAction {
  readonly id: ModelId;
  readonly type: BaseActionType;
  readonly generatedFiles: ActionGeneratedFileType[];

  constructor(
    id: ModelId,
    type: BaseActionType,
    generatedFiles: ActionGeneratedFileType[] = []
  ) {
    this.id = id;
    this.type = type;
    this.generatedFiles = generatedFiles;
  }

  getGeneratedFiles(): ActionGeneratedFileType[] {
    return this.generatedFiles;
  }

  abstract renderForFunctionCall(): FunctionCallType;
  abstract renderForMultiActionsModel({
    conversation,
    model,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
  }): Promise<FunctionMessageTypeModel>;
}

export type ExtractActionBlob<T extends BaseAction> = Pick<
  T,
  {
    // eslint-disable-next-line @typescript-eslint/ban-types
    [K in keyof T]: T[K] extends Function ? never : K;
  }[keyof T]
>;

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
  actionConfiguration: ActionConfigurationType;
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  userMessage: UserMessageType;
  rawInputs: Record<string, unknown>;
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

  // Action execution.
  abstract run(
    auth: Authenticator,
    runParams: BaseActionRunParams,
    customParams: Record<string, unknown>
  ): AsyncGenerator<unknown>;
}
