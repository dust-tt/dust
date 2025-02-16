import type {
  AgentActionSpecification,
  ConversationType,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelConfigurationType,
  ModelId,
  Result,
} from "@dust-tt/types";
import { BaseAction, CoreAPI, Ok } from "@dust-tt/types";
import type {
  MCPActionType,
  MCPConfigurationType,
  MCPErrorEvent,
  MCPHostConfig,
  MCPParamsEvent,
  MCPSuccessEvent,
} from "@dust-tt/types/dist/front/assistant/actions/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import config from "@app/lib/api/config";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPAction } from "@app/lib/models/assistant/actions/mcp";
import logger from "@app/logger/logger";

interface MCPActionBlob {
  id: ModelId;
  agentMessageId: ModelId;
  params: Record<string, unknown>;
  tokensCount: number | null;
  output: string | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
  hostConfig: MCPHostConfig;
}

const CONTEXT_SIZE_DIVISOR_FOR_OUTPUT = 2;

// This action uses the MCP protocol to communicate
export class MCPAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: Record<string, unknown>; // Hold the inputs for the action.
  readonly tokensCount: number | null = null;
  readonly output: string | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number = -1;
  readonly type: MCPActionType["type"] = "mcp_action";
  readonly hostConfig: MCPHostConfig = {
    hostType: "client",
    hostUrl: null,
  };

  constructor(blob: MCPActionBlob) {
    // Why we need the type here since we already have it above ?
    super(blob.id, "mcp_action");

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.tokensCount = blob.tokensCount;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
    this.hostConfig = blob.hostConfig;
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

  async renderForMultiActionsModel({
    model,
  }: {
    conversation: ConversationType;
    model: ModelConfigurationType;
  }): Promise<FunctionMessageTypeModel> {
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

    if (this.tokensCount === null) {
      return {
        role: "function" as const,
        name: this.functionCallName,
        function_call_id: this.functionCallId,
        content: `Error: the content was not tokenized`,
      };
    }

    if (
      this.tokensCount >
      model.contextSize / CONTEXT_SIZE_DIVISOR_FOR_OUTPUT
    ) {
      return {
        role: "function" as const,
        name: this.functionCallName,
        function_call_id: this.functionCallId,
        content: `Error: Action output has too many tokens to be included.`,
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
      hostType: actionConfiguration.hostConfig.hostType,
      hostUrl: actionConfiguration.hostConfig.hostUrl,
      params: rawInputs,
      functionCallId,
      functionCallName: actionConfiguration.name,
      agentMessageId: agentMessage.agentMessageId,
      step,
      workspaceId: owner.id,
    });

    yield {
      type: "mcp_params",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPAction({
        id: action.id,
        params: rawInputs,
        tokensCount: null,
        output: null,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
        hostConfig: actionConfiguration.hostConfig,
      }),
    };

    const model = getSupportedModelConfig(agentConfiguration.model);
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

    // TODO: listen to sse events to provide live feedback to the user.

    await mcpClient.close();

    if (r.isError) {
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

    let content: string = "";
    if (typeof r.content === "string") {
      content = r.content;
    } else {
      try {
        content = JSON.stringify(r.content);
      } catch (e) {
        yield {
          type: "mcp_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "mcp_error",
            message: `Error: the content is not valid JSON: ${e} and we only support string or JSON output for now.`,
          },
        };
        return;
      }
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const tokensRes = await coreAPI.tokenize({
      text: content,
      providerId: model.providerId,
      modelId: model.modelId,
    });

    if (tokensRes.isErr()) {
      yield {
        type: "mcp_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "mcp_error",
          message: `Error tokenizing output: ${tokensRes.error}`,
        },
      };
      return;
    }

    // Store the tokens count and content on the action model for use in the rendering of the
    // action for the model (token count) and the rendering of the action details (content).
    await action.update({
      tokensCount: tokensRes.value.tokens.length,
      output: content,
    });

    yield {
      type: "mcp_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new MCPAction({
        id: action.id,
        params: rawInputs,
        tokensCount: tokensRes.value.tokens.length,
        output: content,
        functionCallId,
        functionCallName: actionConfiguration.name,
        agentMessageId: agentMessage.agentMessageId,
        step,
        hostConfig: actionConfiguration.hostConfig,
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
): Promise<MCPAction[]> {
  const actions = await AgentMCPAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });

  return actions.map((action) => {
    return new MCPAction({
      id: action.id,
      params: action.params,
      tokensCount: action.tokensCount,
      output: action.output,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
      hostConfig: {
        hostType: action.hostType,
        hostUrl: action.hostUrl,
      },
    });
  });
}
