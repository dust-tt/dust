import type {
  AgentActionSpecification,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@dust-tt/types";
import { BaseAction, Ok } from "@dust-tt/types";
import type {
  MCPActionType as MCPActionTypeInterface,
  MCPConfigurationType,
  MCPErrorEvent,
  MCPParamsEvent,
  MCPSuccessEvent,
  MCPToolResultContent,
} from "@dust-tt/types/dist/front/assistant/actions/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";

type NonFunctionProperties<T> = {
  // In that case we just want to exclude the function properties so it's fine that it's loosely typed.
  // eslint-disable-next-line @typescript-eslint/ban-types
  [K in keyof T as T[K] extends Function ? never : K]: T[K];
};

// This action uses the MCP protocol to communicate
class MCPActionType extends BaseAction implements MCPActionTypeInterface {
  readonly agentMessageId: ModelId;
  readonly executionState:
    | "pending"
    | "allowed_explicitely"
    | "allowed_implicitely"
    | "denied" = "pending";
  readonly mcpServerConfigurationId: string;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly output: MCPToolResultContent[] | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly isError: boolean = false;
  readonly type = "mcp_action" as const;

  constructor(blob: NonFunctionProperties<MCPActionTypeInterface>) {
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
      return {
        role: "function" as const,
        name: "missing_function_call_name",
        function_call_id: this.functionCallId ?? "missing_function_call_id",
        content: `Error: the content was not tokenized`,
      };
    }

    if (!this.functionCallId) {
      return {
        role: "function" as const,
        name: this.functionCallName,
        function_call_id: "missing_function_call_id",
        content: `Error: the content was not tokenized`,
      };
    }

    return {
      role: "function" as const,
      name: this.functionCallName,
      function_call_id: this.functionCallId,
      content: this.output ?? "Successfully executed action, no output.",
    };
  }
}

/**
 * Params generation.
 */
export class MCPConfigurationServerRunner extends BaseActionConfigurationServerRunner<MCPConfigurationType> {
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

    // Connect to the MCP proxy and get the action specification.
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

    // Check that the rawInputs are matching the action configuration.
    for (const input of actionConfiguration.inputs) {
      if (!(input.name in rawInputs)) {
        yield {
          type: "mcp_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "mcp_error",
            message: `Error: property ${input.name} is required`,
          },
        };
        return;
      }
      if (typeof rawInputs[input.name] !== input.type) {
        yield {
          type: "mcp_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "mcp_error",
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
    });

    yield {
      type: "mcp_params",
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
        mcpServerConfigurationId: `${actionConfiguration.id}`,
        executionState: "pending",
        isError: false,
        type: "mcp_action",
        generatedFiles: [],
      }),
    };

    const mcpClient = new Client({
      name: "dust-mcp-client",
      version: "1.0.0",
    });

    await mcpClient.connect(
      new SSEClientTransport(new URL("http://localhost:4000"))
    );

    const r = await mcpClient.callTool({
      name: actionConfiguration.name,
      arguments: rawInputs,
    });

    //TODO(mcp): figure out why the type inference is not working here.
    const content: MCPToolResultContent[] = (r.content ??
      []) as MCPToolResultContent[];

    // TODO(mcp): listen to sse events to provide live feedback to the user.

    await mcpClient.close();

    if (r.isError) {
      await action.update({
        isError: true,
      });
      yield {
        type: "mcp_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "mcp_error",
          message: `Error calling tool: ${r.content}`,
        },
      };
      return;
    }

    try {
      await Promise.all(
        content.map(async (i) => {
          await AgentMCPActionOutputItem.create({
            agentMCPActionId: action.id,
            content: i,
          });
        })
      );
    } catch (e) {
      await action.update({
        isError: true,
      });
      yield {
        type: "mcp_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "mcp_error",
          message: `Error: the content is not valid: ${e}`,
        },
      };
      return;
    }

    yield {
      type: "mcp_success",
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
        mcpServerConfigurationId: `${actionConfiguration.id}`,
        executionState: "allowed_explicitely",
        isError: false,
        type: "mcp_action",
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
      mcpServerConfigurationId: action.mcpServerConfigurationId,
      executionState: action.executionState,
      isError: action.isError,
      type: "mcp_action",
      generatedFiles: [],
    });
  });
}
