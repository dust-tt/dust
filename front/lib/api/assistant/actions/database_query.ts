import {
  AgentConfigurationType,
  AgentMessageType,
  cloneBaseConfig,
  ConversationType,
  DatabaseQueryActionType,
  DatabaseQueryRunErrorEvent,
  DatabaseQueryRunSuccessEvent,
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

  const spec = {
    name: "query_database",
    description:
      "The user's request. This is what will be given to the assistant responsible for generating the SQL query, It must include all relevant information.",
    inputs: [
      {
        name: "question",
        description:
          "The user's request. This is what will be given to the assistant responsible for generating the SQL query" +
          "It must include all relevant information, based on the user request and conversation context." +
          "Always unaccent the user's query, replace (eg replace é/è with e etc.)",
        type: "string" as const,
      },
    ],
  };

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

  if (rawInputsRes.isOk()) {
    return new Ok(rawInputsRes.value);
  }
  return new Ok({});
}

/**
 * Run the DatabaseQuery app.
 */
export async function* runDatabaseQueryApp({
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
}): AsyncGenerator<DatabaseQueryRunErrorEvent | DatabaseQueryRunSuccessEvent> {
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
      type: "database_query_run_error",
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
      type: "database_query_run_error",
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
      type: "database_query_run_error",
      created: Date.now(),
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "dust_app_run_error",
        message: `Error running DatabaseQuery app: ${res.error.message}`,
      },
    };
    return;
  }

  const { eventStream } = res.value;
  for await (const event of eventStream) {
    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (event.content.block_name === "OUTPUT" && e.value) {
        const output = JSON.parse(e.value as string);

        const action = await AgentDatabaseQueryAction.create({
          dataSourceWorkspaceId: c.dataSourceWorkspaceId,
          dataSourceId: c.dataSourceId,
          databaseId: c.databaseId,
          databaseQueryConfigurationId: configuration.sId,
          params: input,
          output,
        });
        yield {
          type: "database_query_run_success",
          created: Date.now(),
          configurationId: configuration.sId,
          messageId: agentMessage.sId,
          action: {
            id: action.id,
            type: "database_query_action",
            dataSourceWorkspaceId: action.dataSourceWorkspaceId,
            dataSourceId: action.dataSourceId,
            databaseId: action.databaseId,
            output: action.output,
          },
        };
        return;
      }
    }
  }

  yield {
    type: "database_query_run_error",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    error: {
      code: "dust_app_run_error",
      message: `Error running DatabaseQuery app: no output found.`,
    },
  };
  return;
}
