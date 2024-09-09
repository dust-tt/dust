import type {
  AgentActionSpecification,
  DustAppParameters,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  Result,
  TablesQueryActionType,
  TablesQueryConfigurationType,
  TablesQueryErrorEvent,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
  TablesQuerySuccessEvent,
} from "@dust-tt/types";
import { BaseAction, Ok } from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { DEFAULT_TABLES_QUERY_ACTION_NAME } from "@app/lib/api/assistant/actions/names";
import type { BaseActionRunParams } from "@app/lib/api/assistant/actions/types";
import { BaseActionConfigurationServerRunner } from "@app/lib/api/assistant/actions/types";
import { renderConversationForModelMultiActions } from "@app/lib/api/assistant/generation";
import { getSupportedModelConfig } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import { sanitizeJSONOutput } from "@app/lib/utils";
import logger from "@app/logger/logger";

// Need a model with at least 32k to run tables query.
const TABLES_QUERY_MIN_TOKEN = 28_000;
const RENDERED_CONVERSATION_MIN_TOKEN = 4_000;

interface TablesQueryActionBlob {
  id: ModelId; // AgentTablesQueryAction.
  agentMessageId: ModelId;
  params: DustAppParameters;
  output: Record<string, string | number | boolean> | null;
  functionCallId: string | null;
  functionCallName: string | null;
  step: number;
}

export class TablesQueryAction extends BaseAction {
  readonly agentMessageId: ModelId;
  readonly params: DustAppParameters;
  readonly output: Record<string, string | number | boolean> | null;
  readonly functionCallId: string | null;
  readonly functionCallName: string | null;
  readonly step: number;
  readonly type = "tables_query_action";

  constructor(blob: TablesQueryActionBlob) {
    super(blob.id, "tables_query_action");

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? DEFAULT_TABLES_QUERY_ACTION_NAME,
      arguments: JSON.stringify(this.params),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "";
    content += `OUTPUT:\n`;

    if (this.output === null) {
      content += "(query failed)\n";
    } else {
      content += `${JSON.stringify(this.output, null, 2)}\n`;
    }

    return {
      role: "function" as const,
      name: this.functionCallName ?? DEFAULT_TABLES_QUERY_ACTION_NAME,
      function_call_id: this.functionCallId ?? `call_${this.id.toString()}`,
      content,
    };
  }
}

// Internal interface for the retrieval and rendering of a TableQuery action. This should not be
// used outside of api/assistant. We allow a ModelId interface here because we don't have `sId` on
// actions (the `sId` is on the `Message` object linked to the `UserMessage` parent of this action).
export async function tableQueryTypesFromAgentMessageIds(
  agentMessageIds: ModelId[]
): Promise<TablesQueryActionType[]> {
  const actions = await AgentTablesQueryAction.findAll({
    where: {
      agentMessageId: agentMessageIds,
    },
  });
  return actions.map((action) => {
    return new TablesQueryAction({
      id: action.id,
      params: action.params as DustAppParameters,
      output: action.output as Record<string, string | number | boolean>,
      functionCallId: action.functionCallId,
      functionCallName: action.functionCallName,
      agentMessageId: action.agentMessageId,
      step: action.step,
    });
  });
}

/**
 * Params generation.
 */

// Generate the specification for the TablesQuery app. This is the instruction given to the LLM to
// understand the task.
async function tablesQueryActionSpecification({
  name,
  description,
}: {
  name: string;
  description: string;
}): Promise<AgentActionSpecification> {
  return {
    name,
    description,
    inputs: [],
  };
}

/**
 * Action execution.
 */
export class TablesQueryConfigurationServerRunner extends BaseActionConfigurationServerRunner<TablesQueryConfigurationType> {
  async buildSpecification(
    auth: Authenticator,
    { name, description }: { name: string; description: string | null }
  ): Promise<Result<AgentActionSpecification, Error>> {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runQueryTables`");
    }

    let actionDescription =
      "Query data tables specificied by the user by executing a generated SQL query. " +
      "The function does not require any inputs, the SQL query will be inferred from the conversation history.";
    if (description) {
      actionDescription += `\nDescription of the data tables:\n${description}`;
    }

    const spec = await tablesQueryActionSpecification({
      name,
      description: actionDescription,
    });
    return new Ok(spec);
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
    | TablesQueryErrorEvent
    | TablesQuerySuccessEvent
    | TablesQueryParamsEvent
    | TablesQueryOutputEvent
  > {
    const owner = auth.workspace();
    if (!owner) {
      throw new Error("Unexpected unauthenticated call to `runQueryTables`");
    }

    const { actionConfiguration } = this;

    let output: Record<string, string | boolean | number> = {};

    // Creating action
    const action = await AgentTablesQueryAction.create({
      tablesQueryConfigurationId: actionConfiguration.sId,
      params: rawInputs,
      output,
      functionCallId,
      agentMessageId: agentMessage.agentMessageId,
      step: step,
    });

    yield {
      type: "tables_query_params",
      created: Date.now(),
      configurationId: actionConfiguration.sId,
      messageId: agentMessage.sId,
      action: new TablesQueryAction({
        id: action.id,
        params: action.params as DustAppParameters,
        output: action.output as Record<string, string | number | boolean>,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        agentMessageId: action.agentMessageId,
        step: action.step,
      }),
    };

    // Render conversation for the action.
    const supportedModel = getSupportedModelConfig(agentConfiguration.model);
    if (!supportedModel) {
      throw new Error("Unreachable: Supported model not found.");
    }

    const allowedTokenCount =
      supportedModel.contextSize - TABLES_QUERY_MIN_TOKEN;
    if (allowedTokenCount < RENDERED_CONVERSATION_MIN_TOKEN) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message:
            "The model's context size is too small to be used with TablesQuery.",
        },
      };
      return;
    }

    const renderedConversationRes =
      await renderConversationForModelMultiActions({
        conversation,
        model: supportedModel,
        prompt: agentConfiguration.instructions ?? "",
        allowedTokenCount,
        excludeImages: true,
      });
    if (renderedConversationRes.isErr()) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message: `Error running TablesQuery app: ${renderedConversationRes.error.message}`,
        },
      };
      return;
    }

    const renderedConversation = renderedConversationRes.value;

    // Generating configuration
    const config = cloneBaseConfig(
      DustProdActionRegistry["assistant-v2-query-tables"].config
    );
    const tables = actionConfiguration.tables.map((t) => ({
      workspace_id: t.workspaceId,
      table_id: t.tableId,
      data_source_id: t.dataSourceId,
    }));
    if (tables.length === 0) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message:
            "The assistant does not have access to any tables. Please edit the assistant's Query Tables tool to add tables, or remove the tool.",
        },
      };
      return;
    }
    config.DATABASE_SCHEMA = {
      type: "database_schema",
      tables,
    };
    config.DATABASE = {
      type: "database",
      tables,
    };
    config.DATABASE_TABLE_HEAD = {
      type: "database",
      tables,
    };
    const { model } = agentConfiguration;
    config.MODEL.provider_id = model.providerId;
    config.MODEL.model_id = model.modelId;

    // Running the app
    const res = await runActionStreamed(
      auth,
      "assistant-v2-query-tables",
      config,
      [
        {
          conversation: renderedConversation.modelConversation.messages,
          instructions: agentConfiguration.instructions,
        },
      ],
      {
        conversationId: conversation.sId,
        workspaceId: conversation.owner.sId,
        agentMessageId: agentMessage.sId,
      }
    );

    if (res.isErr()) {
      yield {
        type: "tables_query_error",
        created: Date.now(),
        configurationId: agentConfiguration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "tables_query_error",
          message: `Error running TablesQuery app: ${res.error.message}`,
        },
      };
      return;
    }

    const { eventStream, dustRunId } = res.value;
    for await (const event of eventStream) {
      if (event.type === "error") {
        logger.error(
          {
            workspaceId: owner.id,
            conversationId: conversation.id,
            error: event.content.message,
          },
          "Error running query_tables app"
        );
        yield {
          type: "tables_query_error",
          created: Date.now(),
          configurationId: agentConfiguration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tables_query_error",
            message: `Error running TablesQuery app: ${event.content.message}`,
          },
        };
        return;
      }

      if (event.type === "block_execution") {
        const e = event.content.execution[0][0];

        if (e.error) {
          logger.error(
            {
              workspaceId: owner.id,
              conversationId: conversation.id,
              error: e.error,
            },
            "Error running query_tables app"
          );

          const error =
            e.error === "too_many_result_rows"
              ? {
                  code: "too_many_result_rows" as const,
                  message: `The query returned too many rows. Please refine your query.`,
                }
              : {
                  code: "tables_query_error" as const,
                  message: `Error running TablesQuery app: ${e.error}`,
                };

          yield {
            type: "tables_query_error",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            error,
          };
          return;
        }

        if (event.content.block_name === "SQL") {
          let tmpOutput = null;
          if (e.value) {
            const sql = e.value as string;
            tmpOutput = { query: sql };
          } else {
            tmpOutput = { no_query: true };
          }

          yield {
            type: "tables_query_output",
            created: Date.now(),
            configurationId: agentConfiguration.sId,
            messageId: agentMessage.sId,
            action: new TablesQueryAction({
              id: action.id,
              params: action.params as DustAppParameters,
              output: tmpOutput as Record<string, string | number | boolean>,
              functionCallId: action.functionCallId,
              functionCallName: action.functionCallName,
              agentMessageId: agentMessage.id,
              step: action.step,
            }),
          };
        }

        if (event.content.block_name === "OUTPUT" && e.value) {
          output = JSON.parse(e.value as string);
          if (!output.query) {
            output.no_query = true;
          }
        }
      }
    }

    const sanitizedOutput = sanitizeJSONOutput(output);

    // Updating action
    await action.update({
      output: sanitizedOutput,
      runId: await dustRunId,
    });

    yield {
      type: "tables_query_success",
      created: Date.now(),
      configurationId: agentConfiguration.sId,
      messageId: agentMessage.sId,
      action: new TablesQueryAction({
        id: action.id,
        params: action.params as DustAppParameters,
        output: sanitizedOutput as Record<string, string | number | boolean>,
        functionCallId: action.functionCallId,
        functionCallName: action.functionCallName,
        agentMessageId: action.agentMessageId,
        step: action.step,
      }),
    };
    return;
  }
}
