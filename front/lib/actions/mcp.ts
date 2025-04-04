import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  isDefaultInternalMCPServer,
  isInternalMCPServerName,
} from "@app/lib/actions/mcp_internal_actions/constants";
import {
  augmentInputsWithConfiguration,
  hideInternalConfiguration,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getMCPEvents } from "@app/lib/actions/pubsub";
import type { DataSourceConfiguration } from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
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
import logger from "@app/logger/logger";
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

  mcpServerViewId: string; // Hold the sId of the MCP server view.

  type: "mcp_server_configuration";

  name: string;
  description: string | null;

  dataSources: DataSourceConfiguration[] | null;
  tables: TableDataSourceConfiguration[] | null;
  // TODO(mcp): add other kinds of configurations here.
};

export type MCPToolConfigurationType = Omit<
  MCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
};

type MCPApproveExecutionEvent = {
  type: "tool_approve_execution";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
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

export type MCPFormState = {
  url: string;
  name: string;
  description: string;
  tools: { name: string; description: string }[];
  errors?: {
    url?: string;
    name?: string;
    description?: string;
  };
};

export type MCPFormAction =
  | {
      [K in keyof Omit<MCPFormState, "errors">]: {
        type: "SET_FIELD";
        field: K;
        value: MCPFormState[K];
      };
    }[keyof Omit<MCPFormState, "errors">]
  | {
      type: "SET_ERROR";
      field: keyof MCPFormState["errors"];
      value: string | undefined;
    }
  | {
      type: "RESET";
      config?: null;
      name?: string;
    }
  | { type: "VALIDATE" };

export type MCPActionRunningEvents = MCPParamsEvent | MCPApproveExecutionEvent;

type MCPActionBlob = ExtractActionBlob<MCPActionType>;

// This action uses the MCP protocol to communicate
export class MCPActionType extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly executionState:
    | "pending"
    | "allowed_explicitly"
    | "allowed_implicitly"
    | "denied" = "pending";

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

    // Filter out properties from the inputSchema that have a mimeType matching any value in INTERNAL_MIME_TYPES.CONFIGURATION
    const filteredInputSchema = hideInternalConfiguration(
      this.actionConfiguration.inputSchema
    );

    return new Ok({
      name: this.actionConfiguration.name,
      description: this.actionConfiguration.description ?? "",
      inputs: [],
      inputSchema: filteredInputSchema,
    });
  }

  async *run(
    auth: Authenticator,
    {
      agentConfiguration,
      conversation,
      agentMessage,
      rawInputs,
      functionCallId,
      step,
    }: BaseActionRunParams
  ): AsyncGenerator<
    MCPParamsEvent | MCPSuccessEvent | MCPErrorEvent | MCPApproveExecutionEvent,
    void
  > {
    const owner = auth.getNonNullableWorkspace();
    const { actionConfiguration } = this;

    const localLogger = logger.child({
      actionConfigurationId: actionConfiguration.sId,
      conversationId: conversation.sId,
      messageId: agentMessage.sId,
      workspaceId: conversation.owner.sId,
    });

    const actionBaseParams = {
      agentMessageId: agentMessage.agentMessageId,
      functionCallId,
      functionCallName: actionConfiguration.name,
      generatedFiles: [],
      mcpServerConfigurationId: `${actionConfiguration.id}`,
      params: rawInputs,
      step,
    };

    // Create the action object in the database and yield an event for
    // the generation of the params. We store the action here as the params have been generated, if
    // an error occurs later on, the error will be stored on the parent agent message.
    const action = await AgentMCPAction.create({
      ...actionBaseParams,
      workspaceId: owner.id,
      isError: false,
      executionState: "pending",
    });

    const mcpAction = new MCPActionType({
      ...actionBaseParams,
      executionState: "pending",
      id: action.id,
      isError: false,
      output: null,
      type: "tool_action",
    });

    yield {
      type: "tool_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: mcpAction,
    };

    let status:
      | "allowed_implicitly"
      | "allowed_explicitly"
      | "pending"
      | "denied" = "pending";
    if (
      isInternalMCPServerName(actionConfiguration.name) &&
      isDefaultInternalMCPServer(actionConfiguration.name)
    ) {
      status = "allowed_implicitly";
    } else {
      yield {
        type: "tool_approve_execution",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        action: mcpAction,
        inputs: rawInputs,
      };

      try {
        const actionEventGenerator = getMCPEvents({
          actionId: mcpAction.id,
        });

        localLogger.info("Waiting for action validation");

        // Start listening for action events
        for await (const event of actionEventGenerator) {
          const { data } = event;

          if (
            data.type === "action_approved" &&
            data.actionId === mcpAction.id
          ) {
            status = "allowed_explicitly";
            break;
          } else if (
            data.type === "action_rejected" &&
            data.actionId === mcpAction.id
          ) {
            status = "denied";
            break;
          }
        }

        // The action timed-out, status was not updated
        if (status === "pending") {
          localLogger.info("Action validation timed out");

          // Yield a tool success, with a message that the action timed out
          yield {
            type: "tool_success",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: new MCPActionType({
              ...actionBaseParams,
              executionState: "denied",
              id: action.id,
              isError: false,
              output: [
                {
                  type: "text",
                  text:
                    "The action validation timed out. " +
                    "Using this action is hence forbidden for this message.",
                },
              ],
              type: "tool_action",
            }),
          };
          return;
        }

        if (status === "denied") {
          localLogger.info("Action execution rejected by user");

          // Yield a tool success, with a message that the action was rejected.
          yield {
            type: "tool_success",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: new MCPActionType({
              ...actionBaseParams,
              executionState: "denied",
              id: action.id,
              isError: false,
              output: [
                {
                  type: "text",
                  text:
                    "The user rejected this specific action execution. " +
                    "Using this action is hence forbidden for this message.",
                },
              ],
              type: "tool_action",
            }),
          };
          return;
        }

        localLogger.info("Proceeding with action execution after validation");
      } catch (error) {
        localLogger.error({ error }, "Error checking action validation status");

        yield {
          type: "tool_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tool_error",
            message: `Error checking action validation status: ${JSON.stringify(error)}`,
          },
        };
        return;
      }
    }

    // We put back the preconfigured inputs (data sources for instance) from the agent configuration if any.
    const inputs = augmentInputsWithConfiguration({
      owner: auth.getNonNullableWorkspace(),
      rawInputs,
      actionConfiguration,
    });

    // TODO(mcp): listen to sse events to provide live feedback to the user
    const r = await tryCallMCPTool(auth, {
      actionConfiguration,
      inputs,
    });

    if (r.isErr()) {
      localLogger.error(
        {
          error: r.error.message,
        },
        `Error calling MCP tool.`
      );
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
          message: `Error calling tool ${actionConfiguration.name}.`,
        },
      };
      return;
    }

    const content = r.value;

    await AgentMCPActionOutputItem.bulkCreate(
      content.map((c) => ({
        workspaceId: owner.id,
        agentMCPActionId: action.id,
        content: c,
      }))
    );

    yield {
      type: "tool_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPActionType({
        ...actionBaseParams,
        executionState: status,
        id: action.id,
        isError: false,
        output: content,
        type: "tool_action",
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
      type: "tool_action",
      generatedFiles: [],
    });
  });
}
