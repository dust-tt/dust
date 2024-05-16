import type {
  AgentActionSpecification,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  DustAppParameters,
  FunctionCallType,
  FunctionMessageTypeModel,
  ModelId,
  ModelMessageType,
  Result,
  TablesQueryActionType,
  TablesQueryConfigurationType,
  TablesQueryErrorEvent,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
  TablesQuerySuccessEvent,
} from "@dust-tt/types";
import {
  BaseAction,
  cloneBaseConfig,
  DustProdActionRegistry,
  Ok,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import logger from "@app/logger/logger";

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

  constructor(blob: TablesQueryActionBlob) {
    super(blob.id, "tables_query_action");

    this.agentMessageId = blob.agentMessageId;
    this.params = blob.params;
    this.output = blob.output;
    this.functionCallId = blob.functionCallId;
    this.functionCallName = blob.functionCallName;
    this.step = blob.step;
  }

  renderForModel(): ModelMessageType {
    let content = "";
    if (!this.output) {
      throw new Error(
        "Output not set on TablesQuery action; execution is likely not finished."
      );
    }
    content += `OUTPUT:\n`;
    content += `${JSON.stringify(this.output, null, 2)}\n`;

    return {
      role: "action" as const,
      name: "query_tables",
      content,
    };
  }

  renderForFunctionCall(): FunctionCallType {
    return {
      id: this.functionCallId ?? `call_${this.id.toString()}`,
      name: this.functionCallName ?? "query_tables",
      arguments: JSON.stringify(this.params),
    };
  }

  renderForMultiActionsModel(): FunctionMessageTypeModel {
    let content = "";
    if (!this.output) {
      throw new Error(
        "Output not set on TablesQuery action; execution is likely not finished."
      );
    }
    content += `OUTPUT:\n`;
    content += `${JSON.stringify(this.output, null, 2)}\n`;

    return {
      role: "function" as const,
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
    inputs: [
      {
        name: "question",
        description:
          "The plain language question to answer based on the user request and conversation context. The question should include all the context required to be understood without reference to the conversation. If the user has multiple unanswered questions, make sure to include all of them. If the user asked to correct a previous attempt at the same query in a specific way, this information must be included.",
        type: "string" as const,
      },
    ],
  };
}

// Generates the action specification for generation of rawInputs passed to `runTablesQuery`.
export async function generateTablesQuerySpecification(
  auth: Authenticator,
  {
    name = "query_tables",
    description = "Generates a SQL query from a question in plain language, executes the generated query and return the results.",
  }: { name?: string; description?: string } = {}
): Promise<Result<AgentActionSpecification, Error>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runQueryTables`");
  }

  const spec = await tablesQueryActionSpecification({ name, description });
  return new Ok(spec);
}

/**
 * Action execution.
 */

export async function* runTablesQuery(
  auth: Authenticator,
  {
    configuration,
    actionConfiguration,
    conversation,
    agentMessage,
    rawInputs,
    functionCallId,
    step,
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: TablesQueryConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    rawInputs: Record<string, string | boolean | number>;
    functionCallId: string | null;
    step: number;
  }
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

  if (!rawInputs.question || typeof rawInputs.question !== "string") {
    yield {
      type: "tables_query_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "tables_query_parameters_generation_error",
        message: `Error generating parameters for tables query: failed to generate a valid question.`,
      },
    };
    return;
  }

  const question = rawInputs.question as string;

  let output: Record<string, string | boolean | number> = {};

  // Creating action
  const action = await AgentTablesQueryAction.create({
    tablesQueryConfigurationId: configuration.sId,
    params: rawInputs,
    output,
    functionCallId,
    agentMessageId: agentMessage.agentMessageId,
    step: step,
  });

  yield {
    type: "tables_query_params",
    created: Date.now(),
    configurationId: configuration.sId,
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

  // Generating configuration
  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-query-tables"].config
  );
  const tables = actionConfiguration.tables.map((t) => ({
    workspace_id: t.workspaceId,
    table_id: t.tableId,
    data_source_id: t.dataSourceId,
  }));
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

  // Running the app
  const res = await runActionStreamed(
    auth,
    "assistant-v2-query-tables",
    config,
    [
      {
        question,
        instructions: configuration.instructions,
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
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "tables_query_error",
        message: `Error running TablesQuery app: ${res.error.message}`,
      },
    };
    return;
  }

  const { eventStream } = res.value;
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
        configurationId: configuration.sId,
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
          configurationId: configuration.sId,
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
          configurationId: configuration.sId,
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

  // Updating action
  await action.update({
    output,
  });

  yield {
    type: "tables_query_success",
    created: Date.now(),
    configurationId: configuration.sId,
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
  return;
}
