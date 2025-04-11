import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { DEFAULT_MCP_TOOL_STAKE_LEVEL } from "@app/lib/actions/constants";
import type { MCPToolResultContent } from "@app/lib/actions/mcp_actions";
import { tryCallMCPTool } from "@app/lib/actions/mcp_actions";
import {
  augmentInputsWithConfiguration,
  hideInternalConfiguration,
} from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { getMCPEvents } from "@app/lib/actions/pubsub";
import type { DataSourceConfiguration } from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type {
  ActionGeneratedFileType,
  BaseActionRunParams,
  ExtractActionBlob,
} from "@app/lib/actions/types";
import {
  BaseAction,
  BaseActionConfigurationServerRunner,
} from "@app/lib/actions/types";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { isPlatformMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getExecutionStatusFromConfig } from "@app/lib/actions/utils";
import { processAndStoreFromUrl } from "@app/lib/api/files/upload";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMCPAction,
  AgentMCPActionOutputItem,
} from "@app/lib/models/assistant/actions/mcp";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import logger from "@app/logger/logger";
import type {
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
} from "@app/types";
import { isSupportedFileContentType, Ok, removeNulls } from "@app/types";

export type BaseMCPServerConfigurationType = {
  id: ModelId;

  sId: string;

  type: "mcp_server_configuration";

  name: string;
  description: string | null;
};

// Platform = Remote MCP Server OR our own MCP server.
export type PlatformMCPServerConfigurationType =
  BaseMCPServerConfigurationType & {
    dataSources: DataSourceConfiguration[] | null;
    tables: TableDataSourceConfiguration[] | null;
    childAgentId: string | null;
    additionalConfiguration: Record<string, boolean | number | string>;
    mcpServerViewId: string; // Hold the sId of the MCP server view.
  };

export type LocalMCPServerConfigurationType = BaseMCPServerConfigurationType & {
  localMcpServerId: string;
};

export type MCPServerConfigurationType =
  | PlatformMCPServerConfigurationType
  | LocalMCPServerConfigurationType;

export type PlatformMCPToolConfigurationType = Omit<
  PlatformMCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
  isDefault: boolean;
  permission?: MCPToolStakeLevelType;
  toolServerId?: string;
};

export type LocalMCPToolConfigurationType = Omit<
  LocalMCPServerConfigurationType,
  "type"
> & {
  type: "mcp_configuration";
  inputSchema: JSONSchema;
};

export type MCPToolConfigurationType = (
  | PlatformMCPToolConfigurationType
  | LocalMCPToolConfigurationType
) & {
  originalName: string;
};

export type MCPApproveExecutionEvent = {
  type: "tool_approve_execution";
  created: number;
  configurationId: string;
  messageId: string;
  action: MCPActionType;
  inputs: Record<string, unknown>;
  stake?: MCPToolStakeLevelType;
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
    super(blob.id, blob.type, blob.generatedFiles);

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

    const { status: s } = await getExecutionStatusFromConfig(
      auth,
      actionConfiguration
    );
    let status:
      | "allowed_implicitly"
      | "allowed_explicitly"
      | "pending"
      | "denied" = s;

    if (status === "pending") {
      yield {
        type: "tool_approve_execution",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        action: mcpAction,
        inputs: rawInputs,
        stake: isPlatformMCPToolConfiguration(actionConfiguration)
          ? actionConfiguration.permission
          : DEFAULT_MCP_TOOL_STAKE_LEVEL,
      };

      try {
        const actionEventGenerator = getMCPEvents({
          actionId: mcpAction.id,
        });

        localLogger.info(
          {
            actionName: actionConfiguration.name,
          },
          "Waiting for action validation"
        );

        // Start listening for action events
        for await (const event of actionEventGenerator) {
          const { data } = event;

          if (
            data.type === "always_approved" &&
            data.actionId === mcpAction.id
          ) {
            assert(isPlatformMCPToolConfiguration(actionConfiguration));
            const user = auth.getNonNullableUser();
            await user.appendToMetadata(
              `toolsValidations:${actionConfiguration.toolServerId}`,
              `${actionConfiguration.name}`
            );
          }

          if (
            (data.type === "approved" || data.type === "always_approved") &&
            data.actionId === mcpAction.id
          ) {
            status = "allowed_explicitly";
            break;
          } else if (
            data.type === "rejected" &&
            data.actionId === mcpAction.id
          ) {
            status = "denied";
            break;
          }
        }
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

    // We put back the preconfigured inputs (data sources for instance) from the agent configuration if any.
    const inputs = augmentInputsWithConfiguration({
      owner: auth.getNonNullableWorkspace(),
      rawInputs,
      actionConfiguration,
    });

    // TODO(mcp): listen to sse events to provide live feedback to the user
    const r = await tryCallMCPTool(auth, {
      messageId: agentMessage.sId,
      actionConfiguration,
      conversationId: conversation.sId,
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
    const generatedFiles: ActionGeneratedFileType[] = [];
    for (const c of content) {
      let file: FileResource | null = null;
      if (
        c.type === "resource" &&
        c.resource.mimeType &&
        isSupportedFileContentType(c.resource.mimeType)
      ) {
        const r = await processAndStoreFromUrl(auth, {
          url: c.resource.uri,
          useCase: "conversation",
          fileName: c.resource.uri.split("/").pop() ?? "generated-file",
          contentType: c.resource.mimeType,
        });
        if (r.isErr()) {
          localLogger.error({ error: r.error }, "Error upserting file");
          continue;
        }
        file = r.value;
        generatedFiles.push({
          fileId: file.sId,
          contentType: c.resource.mimeType,
          title: file.fileName,
          snippet: null,
        });
      }

      await AgentMCPActionOutputItem.create({
        workspaceId: owner.id,
        agentMCPActionId: action.id,
        content: c,
        fileId: file?.id,
      });
    }

    yield {
      type: "tool_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPActionType({
        ...actionBaseParams,
        generatedFiles,
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
        include: [
          {
            model: FileModel,
            as: "file",
            required: false,
          },
        ],
      },
    ],
  });

  return actions.map((action) => {
    return new MCPActionType({
      id: action.id,
      params: action.params,
      output: action.outputItems.map((o) => o.content),
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      mcpServerConfigurationId: action.mcpServerConfigurationId,
      executionState: action.executionState,
      isError: action.isError,
      type: "tool_action",
      generatedFiles: removeNulls(
        action.outputItems.map((o) => {
          if (!o.file) {
            return null;
          }

          const file = o.file;
          const fileSid = FileResource.modelIdToSId({
            id: file.id,
            workspaceId: action.workspaceId,
          });

          return {
            fileId: fileSid,
            contentType: file.contentType,
            title: file.fileName,
            snippet: file.snippet,
          };
        })
      ),
    });
  });
}
