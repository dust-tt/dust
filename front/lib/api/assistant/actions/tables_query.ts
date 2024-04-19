import type {
  AgentConfigurationType,
  AgentMessageType,
  ConversationType,
  DustAppParameters,
  ModelMessageType,
  Result,
  TablesQueryActionType,
  TablesQueryErrorEvent,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
  TablesQuerySuccessEvent,
  UserMessageType,
} from "@dust-tt/types";
import {
  cloneBaseConfig,
  DustProdActionRegistry,
  Err,
  isTablesQueryConfiguration,
  Ok,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { generateActionInputs } from "@app/lib/api/assistant/agent";
import type { Authenticator } from "@app/lib/auth";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { AgentTablesQueryAction } from "@app/lib/models/assistant/actions/tables_query";
import logger from "@app/logger/logger";

/**
 * Model rendering of TablesQueryAction.
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
    name: "TablesQuery",
    content,
  };
}

/**
 * Generate the specification for the TablesQuery app.
 * This is the instruction given to the LLM to understand the task.
 */
function getTablesQueryAppSpecification() {
  return {
    name: "query_Tables",
    description:
      "Generates a SQL query from a question in plain language, executes the generated query and return the results.",
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

/**
 * Generate the parameters for the TablesQuery app.
 */
export async function generateTablesQueryAppParams(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<
  Result<
    {
      [key: string]: string | number | boolean;
    },
    Error
  >
> {
  const actionConfig = deprecatedGetFirstActionConfiguration(configuration);

  if (!isTablesQueryConfiguration(actionConfig)) {
    throw new Error(
      "Unexpected action configuration received in `runQueryTables`"
    );
  }

  const spec = getTablesQueryAppSpecification();
  const rawInputsRes = await generateActionInputs(
    auth,
    configuration,
    spec,
    conversation,
    userMessage
  );

  if (rawInputsRes.isErr()) {
    return new Err(rawInputsRes.error);
  }
  return new Ok(rawInputsRes.value);
}

/**
 * Run the TablesQuery app.
 */
export async function* runTablesQuery(
  auth: Authenticator,
  {
    configuration,
    conversation,
    userMessage,
    agentMessage,
  }: {
    configuration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
  }
): AsyncGenerator<
  | TablesQueryErrorEvent
  | TablesQuerySuccessEvent
  | TablesQueryParamsEvent
  | TablesQueryOutputEvent
> {
  // Checking authorizations
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runQueryTables`");
  }

  const actionConfig = deprecatedGetFirstActionConfiguration(configuration);

  if (!isTablesQueryConfiguration(actionConfig)) {
    throw new Error(
      "Unexpected action configuration received in `runQueryTables`"
    );
  }

  // Generating inputs
  const inputRes = await generateTablesQueryAppParams(
    auth,
    configuration,
    conversation,
    userMessage
  );
  if (inputRes.isErr()) {
    yield {
      type: "tables_query_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "tables_query_parameters_generation_error",
        message: `Error generating parameters for tables_query: ${inputRes.error.message}`,
      },
    };
    return;
  }
  const input = inputRes.value;
  let output: Record<string, string | boolean | number> = {};

  // Creating action
  const action = await AgentTablesQueryAction.create({
    tablesQueryConfigurationId: configuration.sId,
    params: input,
    output,
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
  const tables = actionConfig.tables.map((t) => ({
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

  // TODO(2024-04-19 flav) Delete.
  if (isDevelopmentOrDustWorkspace(owner)) {
    config.MODEL.use_tools = true;
  }

  // Running the app
  const res = await runActionStreamed(
    auth,
    "assistant-v2-query-tables",
    config,
    [
      {
        question: input.question,
        instructions: configuration.instructions,
      },
    ]
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
