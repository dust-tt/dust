import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerResult,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { makePersonalAuthenticationError } from "@app/lib/actions/mcp_internal_actions/utils";
import type { ToolContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { SnowflakeClient } from "@app/lib/api/actions/servers/snowflake/client";
import {
  MAX_QUERY_ROWS,
  SNOWFLAKE_TOOLS_METADATA,
} from "@app/lib/api/actions/servers/snowflake/metadata";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { SnowflakeKeyPairCredentialsSchema } from "@app/types/oauth/lib";
import { OAuthAPI } from "@app/types/oauth/oauth_api";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { fromError } from "zod-validation-error";

const CONNECTION_ERROR = new MCPError(
  "Snowflake connection not configured. Please connect your Snowflake account."
);

function handleSnowflakeError(error: Error): ToolHandlerResult {
  if (
    error.name === "RequestFailedError" &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "statusCode" in error.response &&
    (error.response.statusCode === 401 || error.response.statusCode === 403)
  ) {
    return new Ok(makePersonalAuthenticationError("snowflake").content);
  }

  return new Err(new MCPError(error.message));
}

interface SnowflakeQueryTagMetadata {
  workspace_id: string;
  agent_id: string | null;
  agent_name: string | null;
  conversation_id: string | null;
  user_id: string | null;
  user_email: string | null;
}

// Builds Snowflake query tag for agent-level usage tracking.
// Enables customers to track query costs per agent in QUERY_HISTORY.
function buildQueryTagMetadata(
  toolContext?: ToolContext,
  auth?: Authenticator
): string | undefined {
  if (!toolContext?.runContext || !auth) {
    return undefined;
  }

  const { agentConfiguration, conversation } = isAgentLoopRunContext(
    toolContext.runContext
  )
    ? toolContext.runContext
    : {};

  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const metadata: SnowflakeQueryTagMetadata = {
    workspace_id: workspace.sId,
    agent_id: agentConfiguration?.sId ?? null,
    agent_name: agentConfiguration?.name ?? null,
    conversation_id: conversation?.sId ?? null,
    user_id: user?.sId ?? null,
    user_email: user?.email ?? null,
  };

  return JSON.stringify(metadata);
}

async function getClientFromAuthInfo(
  authInfo:
    | {
        extra?: Record<string, unknown>;
        token?: string;
      }
    | null
    | undefined,
  toolContext?: ToolContext,
  auth?: Authenticator
): Promise<Result<SnowflakeClient, MCPError>> {
  const queryTagMetadata = buildQueryTagMetadata(toolContext, auth);

  const account = authInfo?.extra?.snowflake_account;
  const warehouse = authInfo?.extra?.snowflake_warehouse;
  const token = authInfo?.token;

  if (typeof account === "string" && typeof warehouse === "string" && token) {
    return new Ok(
      new SnowflakeClient(
        account,
        { type: "oauth", token },
        warehouse,
        queryTagMetadata
      )
    );
  }

  const credentialId = authInfo?.extra?.credentialId;
  if (typeof credentialId !== "string" || credentialId === "") {
    return new Err(CONNECTION_ERROR);
  }

  const oauthApi = new OAuthAPI(apiConfig.getOAuthAPIConfig(), logger);
  const credentialRes = await oauthApi.getCredentials({
    credentialsId: credentialId,
  });

  if (credentialRes.isErr()) {
    return new Err(CONNECTION_ERROR);
  }

  const contentValidation = SnowflakeKeyPairCredentialsSchema.safeParse(
    credentialRes.value.credential.content
  );
  if (!contentValidation.success) {
    return new Err(
      new MCPError(
        `Invalid Snowflake credentials: ${fromError(contentValidation.error).toString()}`
      )
    );
  }

  const credentials = contentValidation.data;

  return new Ok(
    new SnowflakeClient(
      credentials.account,
      {
        type: "keypair",
        username: credentials.username,
        role: credentials.role,
        privateKey: credentials.private_key,
        privateKeyPassphrase: credentials.private_key_passphrase,
      },
      credentials.warehouse,
      queryTagMetadata
    )
  );
}

const handlers: ToolHandlers<typeof SNOWFLAKE_TOOLS_METADATA> = {
  list_databases: async (_params, { authInfo, runContext, auth }) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listDatabases();
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const databases = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${databases.length} databases`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ databases }, null, 2),
      },
    ]);
  },

  list_schemas: async ({ database }, { authInfo, runContext, auth }) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listSchemas(database);
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const schemas = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${schemas.length} schemas in database "${database}"`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ database, schemas }, null, 2),
      },
    ]);
  },

  list_tables: async ({ database, schema }, { authInfo, runContext, auth }) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listTables(database, schema);
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const tables = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${tables.length} tables/views/semantic views in "${database}"."${schema}"`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ database, schema, tables }, null, 2),
      },
    ]);
  },

  describe_table: async (
    { database, schema, table },
    { authInfo, runContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.describeTable(database, schema, table);
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const columns = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Table "${database}"."${schema}"."${table}" has ${columns.length} columns`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            database,
            schema,
            table,
            columns,
          },
          null,
          2
        ),
      },
    ]);
  },

  describe_semantic_view: async (
    { database, schema, semantic_view },
    { authInfo, runContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.describeSemanticView(
      database,
      schema,
      semantic_view
    );
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const { dimensions, metrics } = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Semantic view "${database}"."${schema}"."${semantic_view}" has ${dimensions.length} dimensions and ${metrics.length} metrics`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(
          { database, schema, semantic_view, dimensions, metrics },
          null,
          2
        ),
      },
    ]);
  },

  query: async (
    { sql, database, schema, warehouse, max_rows },
    { authInfo, runContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      { runContext },
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.readOnlyQuery(
      sql,
      database,
      schema,
      warehouse,
      max_rows ?? MAX_QUERY_ROWS
    );
    if (result.isErr()) {
      return handleSnowflakeError(result.error);
    }

    const { columns, rows, rowCount } = result.value;

    // Format output for LLM consumption
    const columnNames = columns.map((c) => c.name);
    const columnTypes = columns.map((c) => `${c.name}: ${c.type}`);

    return new Ok([
      {
        type: "text" as const,
        text: `Query returned ${rowCount} rows with columns: ${columnNames.join(", ")}`,
      },
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            columns: columnTypes,
            rowCount,
            data: rows,
          },
          null,
          2
        ),
      },
    ]);
  },
};

export const TOOLS = buildTools(SNOWFLAKE_TOOLS_METADATA, handlers);
