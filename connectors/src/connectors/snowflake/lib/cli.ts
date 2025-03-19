import { assertNever } from "@dust-tt/client";

import { getConnectorAndCredentials } from "@connectors/lib/remote_databases/utils";
import { default as topLogger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  SnowflakeCommandType,
  SnowflakeFetchDatabaseResponseType,
  SnowflakeFetchSchemaResponseType,
  SnowflakeFetchTableResponseType,
} from "@connectors/types";
import { isSnowflakeCredentials } from "@connectors/types";

import { fetchDatabases, fetchSchemas, fetchTables } from "./snowflake_api";

export const snowflake = async ({
  command,
  args,
}: SnowflakeCommandType): Promise<
  | SnowflakeFetchDatabaseResponseType
  | SnowflakeFetchSchemaResponseType
  | SnowflakeFetchTableResponseType
> => {
  const logger = topLogger.child({ majorCommand: "snowflake", command, args });

  const connector = await ConnectorResource.fetchById(args.connectorId);
  if (!connector) {
    throw new Error(`Connector ${args.connectorId} not found.`);
  }
  if (connector.type !== "snowflake") {
    throw new Error(`Connector ${args.connectorId} is not of type snowflake`);
  }

  const connectorAndCredentialsRes = await getConnectorAndCredentials({
    connectorId: connector.id,
    isTypeGuard: isSnowflakeCredentials,
    logger,
  });
  if (connectorAndCredentialsRes.isErr()) {
    throw connectorAndCredentialsRes.error;
  }

  const credentials = connectorAndCredentialsRes.value.credentials;

  switch (command) {
    case "fetch-databases": {
      const databases = await fetchDatabases({ credentials });
      if (databases.isErr()) {
        throw databases.error;
      }
      return databases.value;
    }

    case "fetch-schemas": {
      if (args.database === undefined) {
        throw new Error("Database is required for fetching schemas");
      }
      const schemas = await fetchSchemas({
        credentials,
        fromDatabase: args.database,
      });
      if (schemas.isErr()) {
        throw schemas.error;
      }
      return schemas.value;
    }

    case "fetch-tables": {
      if (args.database === undefined && args.schema === undefined) {
        throw new Error("Database or Schema is required for fetching tables");
      }
      const tables = await fetchTables({
        credentials,
        fromDatabase: args.database,
        fromSchema: args.schema,
      });
      if (tables.isErr()) {
        throw tables.error;
      }
      return tables.value;
    }

    default:
      assertNever(command);
  }
};
