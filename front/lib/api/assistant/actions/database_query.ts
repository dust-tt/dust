import {
  AgentConfigurationType,
  AgentMessageType,
  cloneBaseConfig,
  ConversationType,
  DatabaseQueryActionType,
  DatabaseQueryErrorEvent,
  DatabaseQueryOutputEvent,
  DatabaseQueryParamsEvent,
  DatabaseQuerySuccessEvent,
  DustProdActionRegistry,
  Err,
  isDatabaseQueryConfiguration,
  ModelMessageType,
  Ok,
  Result,
  UserMessageType,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { generateActionInputs } from "@app/lib/api/assistant/agent";
import { Authenticator } from "@app/lib/auth";
import { AgentDatabaseQueryAction } from "@app/lib/models";
import logger from "@app/logger/logger";

/**
 * Model rendering of DatabaseQueryAction.
 */

export function renderDatabaseQueryActionForModel(
  action: DatabaseQueryActionType
): ModelMessageType {
  let content = "";
  if (!action.output) {
    throw new Error(
      "Output not set on DatabaseQuery action; execution is likely not finished."
    );
  }
  content += `OUTPUT:\n`;
  content += `${JSON.stringify(action.output, null, 2)}\n`;

  return {
    role: "action" as const,
    name: "DatabaseQuery",
    content,
  };
}

/**
 * Generate the specification for the DatabaseQuery app.
 * This is the instruction given to the LLM to understand the task.
 */
function getDatabaseQueryAppSpecification() {
  return {
    name: "query_database",
    description:
      "Generates a SQL query from a question in plain language, executes the generated query and return the results.",
    inputs: [
      {
        name: "question",
        description:
          "The plain language question to answer based on the user request and conversation context. The question should include all the context required to be understood without reference to the conversation.",
        type: "string" as const,
      },
    ],
  };
}

/**
 * Generate the parameters for the DatabaseQuery app.
 */
export async function generateDatabaseQueryAppParams(
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
  if (!isDatabaseQueryConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `runQueryDatabase`"
    );
  }

  const spec = getDatabaseQueryAppSpecification();
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
 * Run the DatabaseQuery app.
 */
export async function* runDatabaseQuery({
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
  | DatabaseQueryErrorEvent
  | DatabaseQuerySuccessEvent
  | DatabaseQueryParamsEvent
  | DatabaseQueryOutputEvent
> {
  // Checking authorizations
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected unauthenticated call to `runQueryDatabase`");
  }
  const c = configuration.action;
  if (!isDatabaseQueryConfiguration(c)) {
    throw new Error(
      "Unexpected action configuration received in `runQueryDatabase`"
    );
  }
  if (owner.sId !== c.dataSourceWorkspaceId) {
    yield {
      type: "database_query_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "database_query_parameters_generation_error",
        message: "Cannot access the database linked to this action.",
      },
    };
  }

  // Generating inputs
  const inputRes = await generateDatabaseQueryAppParams(
    auth,
    configuration,
    conversation,
    userMessage
  );
  if (inputRes.isErr()) {
    yield {
      type: "database_query_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "database_query_parameters_generation_error",
        message: `Error generating parameters for database_query: ${inputRes.error.message}`,
      },
    };
    return;
  }
  const input = inputRes.value;
  let output: Record<string, string | boolean | number> = {};

  // Creating action
  const action = await AgentDatabaseQueryAction.create({
    dataSourceWorkspaceId: c.dataSourceWorkspaceId,
    dataSourceId: c.dataSourceId,
    databaseId: c.databaseId,
    databaseQueryConfigurationId: configuration.sId,
    params: input,
    output,
  });

  yield {
    type: "database_query_params",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "database_query_action",
      dataSourceWorkspaceId: action.dataSourceWorkspaceId,
      dataSourceId: action.dataSourceId,
      databaseId: action.databaseId,
      params: action.params,
      output: action.output,
    },
  };

  // Generating configuration
  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-query-database"].config
  );
  const database = {
    workspace_id: c.dataSourceWorkspaceId,
    data_source_id: c.dataSourceId,
    database_id: c.databaseId,
  };
  config.DATABASE_SCHEMA = {
    type: "database_schema",
    database,
  };
  config.DATABASE = {
    type: "database",
    database,
  };

  // Running the app
  const res = await runActionStreamed(
    auth,
    "assistant-v2-query-database",
    config,
    [{ question: input.question }]
  );

  if (res.isErr()) {
    yield {
      type: "database_query_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "database_query_error",
        message: `Error running DatabaseQuery app: ${res.error.message}`,
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
        "Error running query_database app"
      );
      yield {
        type: "database_query_error",
        created: Date.now(),
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "database_query_error",
          message: `Error running DatabaseQuery app: ${event.content.message}`,
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
          "Error running query_database app"
        );
        yield {
          type: "database_query_error",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          error: {
            code: "database_query_error",
            message: `Error executing DatabaseQuery app: ${e.error}`,
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
          type: "database_query_output",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          action: {
            id: action.id,
            type: "database_query_action",
            dataSourceWorkspaceId: action.dataSourceWorkspaceId,
            dataSourceId: action.dataSourceId,
            databaseId: action.databaseId,
            params: action.params,
            output: tmpOutput,
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
    type: "database_query_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    action: {
      id: action.id,
      type: "database_query_action",
      dataSourceWorkspaceId: action.dataSourceWorkspaceId,
      dataSourceId: action.dataSourceId,
      databaseId: action.databaseId,
      params: action.params,
      output: action.output,
    },
  };
  return;
}
