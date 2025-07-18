import type {
  ClientSideMCPServerConfigurationType,
  MCPServerConfigurationType,
  MCPToolConfigurationType,
} from "@app/lib/actions/mcp";
import type {
  ActionConfigurationType,
  AgentActionSpecification,
} from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentMessageType,
  AllSupportedFileContentType,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  Result,
} from "@app/types";

export type ActionGeneratedFileType = {
  fileId: string;
  title: string;
  contentType: AllSupportedFileContentType;
  snippet: string | null;
};

export type BaseActionType = "tool_action";

export interface BaseAgentActionType {
  type: BaseActionType;
  id: ModelId;
}
export abstract class BaseAction implements BaseAgentActionType {
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
  abstract renderForMultiActionsModel(
    auth: Authenticator,
    {
      conversation,
      model,
    }: {
      conversation: ConversationType;
      model: ModelConfigurationType;
    }
  ): Promise<FunctionMessageTypeModel>;
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
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  rawInputs: Record<string, unknown>;
  functionCallId: string | null;
  step: number;
  stepContentId?: ModelId;
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

export type AgentLoopRunContextType = {
  agentConfiguration: AgentConfigurationType;
  actionConfiguration: MCPToolConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
  stepActionIndex: number;
  stepActions: ActionConfigurationType[];
  citationsRefsOffset: number;
};

export type AgentLoopListToolsContextType = {
  agentConfiguration: AgentConfigurationType;
  agentActionConfiguration: MCPServerConfigurationType;
  clientSideActionConfigurations?: ClientSideMCPServerConfigurationType[];
  conversation: ConversationType;
  agentMessage: AgentMessageType;
};

export type AgentLoopContextType =
  | {
      runContext: AgentLoopRunContextType;
      listToolsContext?: never;
    }
  | {
      runContext?: never;
      listToolsContext: AgentLoopListToolsContextType;
    };
