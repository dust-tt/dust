import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
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
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";

const CONNECTION_ERROR = new MCPError(
  "Snowflake connection not configured. Please connect your Snowflake account."
);

interface SnowflakeQueryTagMetadata {
  workspace_id: string;
  agent_id: string;
  agent_name: string;
  conversation_id: string;
  user_id: string | null;
}

// Builds Snowflake query tag for agent-level usage tracking.
// Enables customers to track query costs per agent in QUERY_HISTORY.
function buildQueryTagMetadata(
  agentLoopContext?: AgentLoopContextType,
  auth?: Authenticator
): string | undefined {
  if (!agentLoopContext?.runContext || !auth) {
    return undefined;
  }

  const { agentConfiguration, conversation } = agentLoopContext.runContext;
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.user();

  const metadata: SnowflakeQueryTagMetadata = {
    workspace_id: workspace.sId,
    agent_id: agentConfiguration.sId,
    agent_name: agentConfiguration.name,
    conversation_id: conversation.sId,
    user_id: user?.sId ?? null,
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
  agentLoopContext?: AgentLoopContextType,
  auth?: Authenticator
): Promise<Result<SnowflakeClient, MCPError>> {
  const queryTagMetadata = buildQueryTagMetadata(agentLoopContext, auth);

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

  const contentValidation = SnowflakeKeyPairCredentialsSchema.decode(
    credentialRes.value.credential.content
  );
  if (isLeft(contentValidation)) {
    const pathError = reporter.formatValidationErrors(contentValidation.left);
    return new Err(new MCPError(`Invalid Snowflake credentials: ${pathError}`));
  }

  const credentials = contentValidation.right;

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
  list_databases: async (_params, { authInfo, agentLoopContext, auth }) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      agentLoopContext,
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listDatabases();
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
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

  list_schemas: async ({ database }, { authInfo, agentLoopContext, auth }) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      agentLoopContext,
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listSchemas(database);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
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

  list_tables: async (
    { database, schema },
    { authInfo, agentLoopContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      agentLoopContext,
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.listTables(database, schema);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const tables = result.value;
    return new Ok([
      {
        type: "text" as const,
        text: `Found ${tables.length} tables/views in "${database}"."${schema}"`,
      },
      {
        type: "text" as const,
        text: JSON.stringify({ database, schema, tables }, null, 2),
      },
    ]);
  },

  describe_table: async (
    { database, schema, table },
    { authInfo, agentLoopContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      agentLoopContext,
      auth
    );
    if (clientRes.isErr()) {
      return clientRes;
    }

    const result = await clientRes.value.describeTable(database, schema, table);
    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
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

  query: async (
    { sql, database, schema, warehouse, max_rows },
    { authInfo, agentLoopContext, auth }
  ) => {
    const clientRes = await getClientFromAuthInfo(
      authInfo,
      agentLoopContext,
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
      return new Err(new MCPError(result.error.message));
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
