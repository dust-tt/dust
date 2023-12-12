import {
  AgentConfigurationType,
  AgentMessageType,
  cloneBaseConfig,
  DatabaseQueryActionType,
  DatabaseQueryRunErrorEvent,
  DatabaseQueryRunSuccessEvent,
  DustProdActionRegistry,
  isDatabaseQueryConfiguration,
  ModelMessageType,
  UserMessageType,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import { Authenticator } from "@app/lib/auth";
import { AgentDatabaseQueryAction } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";

export async function* runDatabaseQueryApp({
  auth,
  configuration,
  userMessage,
  agentMessage,
}: {
  auth: Authenticator;
  configuration: AgentConfigurationType;
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
    throw new Error("Unexpected datasource received in `runQueryDatabase`");
  }

  // Configuring and running the App
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

  const res = await runActionStreamed(
    auth,
    "assistant-v2-query-database",
    config,
    [{ question: userMessage.content }]
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
          sId: generateModelSId(),
          dataSourceWorkspaceId: c.dataSourceWorkspaceId,
          dataSourceId: c.dataSourceId,
          databaseId: c.databaseId,
          databaseQueryConfigurationId: configuration.sId,
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
