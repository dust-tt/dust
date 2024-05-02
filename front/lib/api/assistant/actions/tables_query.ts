import type {
  AgentActionSpecification,
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  DustAppParameters,
  ModelMessageType,
  Result,
  TablesQueryActionType,
  TablesQueryConfigurationType,
  TablesQueryErrorEvent,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
  TablesQuerySuccessEvent,
} from "@dust-tt/types";
import { cloneBaseConfig, DustProdActionRegistry, Ok } from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import type { Authenticator } from "@app/lib/auth";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import logger from "@app/logger/logger";

/**
 * Model rendering of TableQueries.
 */

export function renderTablesQueryActionForModel(
  action: TablesQueryActionType
): ModelMessageType {
  let content = "";
  if (!action.output) {
    throw new Error(
      "Output not set on TablesQuery action; execution is likely not finished."
    );
  }
  content += `OUTPUT:\n`;
  content += `${JSON.stringify(action.output, null, 2)}\n`;

  return {
    role: "action" as const,
    name: "query_tables",
    content,
  };
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
  }: {
    configuration: AgentConfigurationType;
    actionConfiguration: TablesQueryConfigurationType;
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    rawInputs: Record<string, string | boolean | number>;
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
    agentMessageId: agentMessage.agentMessageId,
  });

  yield {
    type: "tables_query_params",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "tables_query_action",
      params: action.params as DustAppParameters,
      output: action.output as Record<string, string | number | boolean>,
    },
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
          action: {
            id: action.id,
            type: "tables_query_action",
            params: action.params as DustAppParameters,
            output: tmpOutput as Record<string, string | number | boolean>,
          },
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
    action: {
      id: action.id,
      type: "tables_query_action",
      params: action.params as DustAppParameters,
      output: action.output as Record<string, string | number | boolean>,
    },
  };
  return;
}
