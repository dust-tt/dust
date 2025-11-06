import { DBSQLClient } from "@databricks/sql";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import type {
  RemoteDBDatabase,
  RemoteDBSchema,
  RemoteDBTable,
  RemoteDBTree,
} from "@connectors/lib/remote_databases/utils";
import type { Logger } from "@connectors/logger/logger";
import type { DatabricksCredentials } from "@connectors/types";
import { normalizeError } from "@connectors/types";
const MAX_TABLES_PER_SCHEMA = 1000;
const EXCLUDE_CATALOGS = new Set(["system"]);
const EXCLUDE_SCHEMAS = new Set(["information_schema"]);

type DatabricksSession = {
  executeStatement: (
    statement: string,
    options?: { runAsync?: boolean }
  ) => Promise<{
    fetchAll: () => Promise<Array<Record<string, unknown>>>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

function quoteIdentifier(identifier: string): string {
  return `\`${identifier.replace(/`/g, "``")}\``;
}

function escapeLiteral(literal: string): string {
  return `'${literal.replace(/'/g, "''")}'`;
}

async function withSession<T>(
  credentials: DatabricksCredentials,
  handler: (session: DatabricksSession) => Promise<T>
): Promise<Result<T, Error>> {
  const client = new DBSQLClient();
  let connection: DatabricksSession | null = null;
  try {
    connection = (await client.connect({
      host: credentials.host,
      path: credentials.http_path,
      token: credentials.access_token,
    })) as unknown as DatabricksSession;

    const session = (await (
      connection as unknown as {
        openSession: () => Promise<DatabricksSession>;
      }
    ).openSession()) as DatabricksSession;

    try {
      const res = await handler(session);
      await session.close().catch(() => undefined);
      await (connection as unknown as { close: () => Promise<void> })
        .close()
        .catch(() => undefined);
      return new Ok(res);
    } catch (error) {
      await session.close().catch(() => undefined);
      await (connection as unknown as { close: () => Promise<void> })
        .close()
        .catch(() => undefined);
      return new Err(normalizeError(error));
    }
  } catch (error) {
    if (connection) {
      await (connection as unknown as { close: () => Promise<void> })
        .close()
        .catch(() => undefined);
    } else {
      await client.close().catch(() => undefined);
    }
    return new Err(normalizeError(error));
  }
}

async function executeStatement(
  session: DatabricksSession,
  statement: string
): Promise<Array<Record<string, unknown>>> {
  const operation = await session.executeStatement(statement, {
    runAsync: true,
  });

  try {
    const rows = await operation.fetchAll();
    return rows as Array<Record<string, unknown>>;
  } finally {
    await operation.close().catch(() => undefined);
  }
}

function mapToString(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return null;
}

export function isAuthenticationError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("authentication") ||
    message.includes("access token")
  );
}

type TestConnectionErrorCode = "INVALID_CREDENTIALS" | "UNKNOWN";

export class TestConnectionError extends Error {
  code: TestConnectionErrorCode;

  constructor(code: TestConnectionErrorCode, message: string) {
    super(message);
    this.name = "TestDatabricksConnectionError";
    this.code = code;
  }
}

export function isTestConnectionError(
  error: Error
): error is TestConnectionError {
  return error.name === "TestDatabricksConnectionError";
}

export const testConnection = async ({
  credentials,
}: {
  credentials: DatabricksCredentials;
}): Promise<Result<string, TestConnectionError>> => {
  const res = await withSession(credentials, async (session) => {
    await executeStatement(session, "SELECT 1");
    return "Connection successful";
  });

  if (res.isErr()) {
    const err = res.error;
    if (isAuthenticationError(err)) {
      return new Err(
        new TestConnectionError(
          "INVALID_CREDENTIALS",
          "Invalid Databricks credentials. Please verify the host, HTTP path, and access token."
        )
      );
    }

    return new Err(new TestConnectionError("UNKNOWN", err.message));
  }

  return new Ok(res.value);
};

export const fetchCatalogs = async ({
  credentials,
  session,
  logger,
}: {
  credentials: DatabricksCredentials;
  session?: DatabricksSession;
  logger?: Logger;
}): Promise<Result<Array<RemoteDBDatabase>, Error>> => {
  const run = async (s: DatabricksSession) => {
    const rows = await executeStatement(
      s,
      "SELECT catalog_name FROM system.information_schema.catalogs"
    );

    const catalogs: RemoteDBDatabase[] = rows
      .map((row) => mapToString(row, "catalog_name"))
      .filter((name): name is string => Boolean(name))
      .filter((name) => !EXCLUDE_CATALOGS.has(name.toLowerCase()))
      .map((name) => ({ name }));

    logger?.info(
      { catalogsCount: catalogs.length },
      "[Databricks] fetchCatalogs"
    );

    return catalogs;
  };

  if (session) {
    try {
      const catalogs = await run(session);
      return new Ok(catalogs);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  return withSession(credentials, run);
};

export const fetchSchemas = async ({
  credentials,
  catalogName,
  session,
  logger,
}: {
  credentials: DatabricksCredentials;
  catalogName: string;
  session?: DatabricksSession;
  logger?: Logger;
}): Promise<Result<Array<RemoteDBSchema>, Error>> => {
  const run = async (s: DatabricksSession) => {
    const rows = await executeStatement(
      s,
      `SELECT schema_name FROM ${quoteIdentifier(catalogName)}.information_schema.schemata`
    );

    const schemas: RemoteDBSchema[] = rows
      .map((row) => mapToString(row, "schema_name"))
      .filter((name): name is string => Boolean(name))
      .filter((name) => !EXCLUDE_SCHEMAS.has(name.toLowerCase()))
      .map((name) => ({
        name,
        database_name: catalogName,
      }));

    logger?.info(
      {
        catalogName,
        schemasCount: schemas.length,
      },
      "[Databricks] fetchSchemas"
    );

    return schemas;
  };

  if (session) {
    try {
      const schemas = await run(session);
      return new Ok(schemas);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  return withSession(credentials, run);
};

export const fetchTables = async ({
  credentials,
  catalogName,
  schemaName,
  session,
  logger,
}: {
  credentials: DatabricksCredentials;
  catalogName: string;
  schemaName: string;
  session?: DatabricksSession;
  logger?: Logger;
}): Promise<Result<Array<RemoteDBTable>, Error>> => {
  const run = async (s: DatabricksSession) => {
    const rows = await executeStatement(
      s,
      `SELECT table_name, comment AS table_comment FROM ${quoteIdentifier(
        catalogName
      )}.information_schema.tables WHERE table_schema = ${escapeLiteral(schemaName)}`
    );

    const tables: RemoteDBTable[] = rows.flatMap((row) => {
      const name = mapToString(row, "table_name");
      if (!name) {
        return [];
      }
      const description =
        mapToString(row, "table_comment") ??
        mapToString(row, "comment") ??
        undefined;
      return [
        {
          name,
          database_name: catalogName,
          schema_name: schemaName,
          ...(description ? { description } : {}),
        },
      ];
    });

    logger?.info(
      {
        catalogName,
        schemaName,
        tablesCount: tables.length,
      },
      "[Databricks] fetchTables"
    );

    return tables;
  };

  if (session) {
    try {
      const tables = await run(session);
      return new Ok(tables);
    } catch (error) {
      return new Err(normalizeError(error));
    }
  }

  return withSession(credentials, run);
};

export const fetchTree = async ({
  credentials,
  logger,
}: {
  credentials: DatabricksCredentials;
  logger: Logger;
}): Promise<Result<RemoteDBTree, Error>> => {
  const res = await withSession(credentials, async (session) => {
    const catalogsRes = await fetchCatalogs({
      credentials,
      session,
      logger,
    });
    if (catalogsRes.isErr()) {
      throw catalogsRes.error;
    }
    const catalogs = catalogsRes.value;

    const databases: RemoteDBTree["databases"] = [];

    for (const catalog of catalogs) {
      const schemasRes = await fetchSchemas({
        credentials,
        catalogName: catalog.name,
        session,
        logger,
      });
      if (schemasRes.isErr()) {
        throw schemasRes.error;
      }
      const schemas = schemasRes.value;

      const schemaEntries: Array<RemoteDBSchema & { tables: RemoteDBTable[] }> =
        [];

      for (const schema of schemas) {
        const tablesRes = await fetchTables({
          credentials,
          catalogName: catalog.name,
          schemaName: schema.name,
          session,
          logger,
        });
        if (tablesRes.isErr()) {
          throw tablesRes.error;
        }
        const tables = tablesRes.value;

        if (tables.length > MAX_TABLES_PER_SCHEMA) {
          logger.warn(
            {
              catalogName: catalog.name,
              schemaName: schema.name,
              tablesCount: tables.length,
            },
            `[Databricks] Skipping schema ${schema.name} with ${tables.length} tables because it exceeds ${MAX_TABLES_PER_SCHEMA} tables.`
          );
          schemaEntries.push({
            ...schema,
            tables: [],
          });
          continue;
        }

        schemaEntries.push({
          ...schema,
          tables,
        });
      }

      databases.push({
        ...catalog,
        schemas: schemaEntries,
      });
    }

    return {
      databases,
    } satisfies RemoteDBTree;
  });

  if (res.isErr()) {
    return new Err(res.error);
  }

  return new Ok(res.value);
};

export const isConnectionReadonly = () => new Ok(undefined);
