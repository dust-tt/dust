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
          "The plain language question to answer based on the user request and conversation context. The question should include all the context required to be understood without reference to the conversation.",
        type: "string" as const,
      },
      {
        name: "guidelines",
        description:
          "Some additional guidelines and context that could help generate the right query. This could come from the assistant's instructions or from the conversation history. Return an empty string when not applicable.",
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
  const c = configuration.action;
  if (!isTablesQueryConfiguration(c)) {
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
export async function* runTablesQuery({
  auth,
  configuration,
  conversation,
  userMessage,
  agentMessage,
}: {
  auth: Authenticator;
  configuration: AgentConfigurationType;
  conversation: ConversationType;
  userMessage: UserMessageType;
  agentMessage: AgentMessageType;
}): AsyncGenerator<
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
  const c = configuration.action;
  if (!isTablesQueryConfiguration(c)) {
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
  const tables = c.tables.map((t) => ({
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
    [{ question: input.question, guidelines: input.guidelines }]
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
        yield {
          type: "tables_query_error",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "tables_query_error",
            message: `Error running TablesQuery app: ${e.error}`,
          },
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
