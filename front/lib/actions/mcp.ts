import type { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import type {
  BaseActionRunParams,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import {
  BaseAction,
  BaseActionConfigurationServerRunner,
} from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@app/types";
import { Ok } from "@app/types";

export type MCPServerConfigurationType = {
  id: ModelId;
  sId: string;

  //TODO(mcp): handle hosted and client
  serverType: "internal" | "remote";
  internalMCPServerId: (typeof AVAILABLE_INTERNAL_MCPSERVER_IDS)[number] | null;
  remoteMCPServerId: string | null; // Hold the sId of the remote MCP server.

  type: "mcp_server_configuration";

  name: string;
  description: string | null;
};

export type MCPToolConfigurationType = Omit<
  MCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputs: {
    name: string;
    description: string;
    type: "string" | "number" | "boolean" | "array" | "object";
    items?: {
      type: "string" | "number" | "boolean";
    };
  }[];
};

type MCPParamsEvent = {
  type: "tool_params";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

type MCPSuccessEvent = {
  type: "tool_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
};

type MCPErrorEvent = {
  type: "tool_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

export type MCPActionRunningEvents = MCPParamsEvent;

type MCPActionBlob = ExtractActionBlob<MCPActionType>;

// This action uses the MCP protocol to communicate
export class MCPActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly executionState:
    | "pending"
    | "allowed_explicitely"
    | "allowed_implicitely"
    | "denied" = "pending";
  readonly serverType: MCPServerConfigurationType["serverType"] = "internal";
  readonly internalMCPServerId: MCPServerConfigurationType["internalMCPServerId"] =
    null;
  readonly remoteMCPServerId: MCPServerConfigurationType["remoteMCPServerId"] =
    null;
  readonly mcpServerConfigurationId: string;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly output: MCPToolResultContent[] | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly isError: boolean = false;
  readonly type = "tool_action" as const;

  constructor(blob: MCPActionBlob) {
    super(blob.id, blob.type);

    this.agentMessageId = blob.agentMessageId;
    this.mcpServerConfigurationId = blob.mcpServerConfigurationId;
    this.executionState = blob.executionState;
    this.isError = blob.isError;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    if (!this.functionCallId) {
      throw new Error("MCPAction: functionCallId is required");
    }
    if (!this.functionCallName) {
      throw new Error("MCPAction: functionCallName is required");
    }

    return {
      id: this.functionCallId,
      name: this.functionCallName,
      arguments: JSON.stringify(this.params),
    };
  }

  async renderForMultiActionsModel(): Promise<FunctionMessageTypeModel> {
    if (!this.functionCallName) {
      throw new Error("MCPAction: functionCallName is required");
    }

    if (!this.functionCallId) {
      throw new Error("MCPAction: functionCallId is required");
    }

    return {
      role: "function" as const,
      name: this.functionCallName,
      function_call_id: this.functionCallId,
      content: this.output
        ? JSON.stringify(this.output)
        : "Successfully executed action, no output.",
    };
  }
}

/**
 * Params generation.
 */
export class MCPConfigurationServerRunner extends BaseActionConfigurationServerRunner<MCPToolConfigurationType> {
  // Generates the action specification for generation of rawInputs passed to `run`.
  async buildSpecification(
    auth: Authenticator
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error(
        "Unexpected unauthenticated call to `runMCPConfiguration`"
      );
    }
    //TODO(mcp): remove inputs that have been preconfigured in the agent configuration so we don't show them to the model.
    // They will be added back in the `run` method.

    return new Ok({
      name: this.actionConfiguration.name,
      description: this.actionConfiguration.description ?? "",
      inputs: this.actionConfiguration.inputs,
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<MCPParamsEvent | MCPSuccessEvent | MCPErrorEvent, void> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `run`");
    }

    const { actionConfiguration } = this;

    // TODO(mcp): Check that the rawInputs are matching the action configuration
    for (const input of actionConfiguration.inputs) {
      if (!(input.name in rawInputs)) {
        yield {
          type: "tool_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tool_error",
            message: `Error: property ${input.name} is required`,
          },
        };
        return;
      }
      if (typeof rawInputs[input.name] !== input.type) {
        yield {
          type: "tool_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tool_error",
            message: `Error: property ${input.name} is of type ${input.type} but got ${typeof rawInputs[input.name]}`,
          },
        };
        return;
      }
    }

    // Create the action object in the database and yield an event for
    // the generation of the params. We store the action here as the params have been generated, if
    // an error occurs later on, the error will be stored on the parent agent message.
    const action = await AgentMCPAction.create({
      mcpServerConfigurationId: `${actionConfiguration.id}`,
      params: rawInputs,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
      isError: false,
      executionState: "pending",
      serverType: actionConfiguration.serverType,
      internalMCPServerId: actionConfiguration.internalMCPServerId,
      remoteMCPServerId: actionConfiguration.remoteMCPServerId,
    });

    yield {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPActionType({
        id: action.id,
        params: rawInputs,
        output: null,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
        serverType: actionConfiguration.serverType,
        internalMCPServerId: actionConfiguration.internalMCPServerId,
        remoteMCPServerId: actionConfiguration.remoteMCPServerId,
        mcpServerConfigurationId: `${actionConfiguration.id}`,
        executionState: "pending",
        isError: false,
        type: "tool_action",
        generatedFiles: [],
      }),
    };
    // TODO(mcp): this is where we put back the preconfigured inputs (datasources, auth token, etc) from the agent configuration if any.

    // TODO(mcp): listen to sse events to provide live feedback to the user
    const r = await tryCallMCPTool({
      owner,
      actionConfiguration,
      rawInputs,
    });

    if (r.isErr()) {
      await action.update({
        isError: true,
      });
      yield {
        type: "tool_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tool_error",
          message: `Error calling tool ${actionConfiguration.name}: ${JSON.stringify(rawInputs)} => ${JSON.stringify(r.error.message)}`,
        },
      };
      return;
    }

    const content = r.value;

    await Promise.all(
      content.map(async (i) => {
        await AgentMCPActionOutputItem.create({
          workspaceId: owner.id,
          agentMCPActionId: action.id,
          content: i,
        });
      })
    );

    yield {
      type: "tool_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPActionType({
        id: action.id,
        params: rawInputs,
        output: content,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
        serverType: actionConfiguration.serverType,
        internalMCPServerId: actionConfiguration.internalMCPServerId,
        remoteMCPServerId: actionConfiguration.remoteMCPServerId,
        mcpServerConfigurationId: `${actionConfiguration.id}`,
        executionState: "allowed_explicitely",
        isError: false,
        type: "tool_action",
        generatedFiles: [],
      }),
    };
  }
}

/**
 * Action rendering.
 */

// Internal interface for the retrieval and rendering of a MCPAction actions. This
// should not be used outside of api/assistant. We allow a ModelId interface here because we don't
// have `sId` on actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of
// this action).
export async function mcpActionTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<MCPActionType[]> {
  const actions = await AgentMCPAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
    include: [
      {
        model: AgentMCPActionOutputItem,
        as: "outputItems",
        required: false,
      },
    ],
  });

  return actions.map((action) => {
    return new MCPActionType({
      id: action.id,
      params: action.params,
      output: action.outputItems.map((i) => i.content),
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      serverType: action.serverType,
      internalMCPServerId: action.internalMCPServerId,
      remoteMCPServerId: action.remoteMCPServerId,
      mcpServerConfigurationId: action.mcpServerConfigurationId,
      executionState: action.executionState,
      isError: action.isError,
      type: "tool_action",
      generatedFiles: [],
    });
  });
}
