import type { Result } from "@dust-tt/client";
import { assertNever, Err, Ok } from "@dust-tt/client";
import * as t from "io-ts";

import { apiConfig } from "@connectors/lib/api/config";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import { getContentNodeTypeFromInternalId } from "@connectors/lib/remote_databases/content_nodes";
import type { Logger } from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { ConnectionCredentials } from "@connectors/types";
import type { ModelId } from "@connectors/types";
import { getConnectionCredentials } from "@connectors/types";

export const remoteDBDatabaseCodec = t.type({
  name: t.string,
});
export type RemoteDBDatabase = t.TypeOf<typeof remoteDBDatabaseCodec>;

export const remoteDBSchemaCodec = t.type({
  name: t.string,
  database_name: t.string,
});
export type RemoteDBSchema = t.TypeOf<typeof remoteDBSchemaCodec>;

export const remoteDBTableCodec = t.type({
  name: t.string,
  database_name: t.string,
  schema_name: t.string,
});
export type RemoteDBTable = t.TypeOf<typeof remoteDBTableCodec>;

export type RemoteDBTree = {
  databases: (RemoteDBDatabase & {
    schemas: (RemoteDBSchema & {
      tables: RemoteDBTable[];
    })[];
  })[];
};

// Helper functions to get connector and credentials
export const getConnector = async ({
  connectorId,
  logger,
}: {
  connectorId: ModelId;
  logger: Logger;
}): Promise<
  Result<
    {
      connector: ConnectorResource;
    },
    Error
  >
> => {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    logger.error({ connectorId }, "Connector not found");
    return new Err(new Error("Connector not found"));
  }
  return new Ok({ connector });
};

export const getCredentials = async <T extends ConnectionCredentials>({
  credentialsId,
  isTypeGuard,
  logger,
}: {
  credentialsId: string;
  isTypeGuard: (credentials: ConnectionCredentials) => credentials is T;
  logger: Logger;
}): Promise<
  Result<
    {
      credentials: T;
    },
    Error
  >
> => {
  const credentialsRes = await getConnectionCredentials({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    credentialsId,
  });
  if (credentialsRes.isErr()) {
    logger.error({ credentialsId }, "Failed to retrieve credentials");
    return new Err(Error("Failed to retrieve credentials"));
  }
  // Narrow the type of credentials to just the username/password variant
  const credentials = credentialsRes.value.credential.content;
  if (!isTypeGuard(credentials)) {
    throw new Error(
      `Invalid credentials types, type guard: ${isTypeGuard.name}`
    );
  }
  return new Ok({
    credentials,
  });
};

export const getConnectorAndCredentials = async <
  T extends ConnectionCredentials,
>({
  connectorId,
  isTypeGuard,
  logger,
}: {
  connectorId: ModelId;
  isTypeGuard: (credentials: ConnectionCredentials) => credentials is T;
  logger: Logger;
}): Promise<
  Result<
    {
      connector: ConnectorResource;
      credentials: T;
    },
    { code: "connector_not_found" | "invalid_credentials"; error: Error }
  >
> => {
  const connectorRes = await getConnector({ connectorId, logger });
  if (connectorRes.isErr()) {
    return new Err({
      code: "connector_not_found",
      error: connectorRes.error,
    });
  }
  const connector = connectorRes.value.connector;

  const credentialsRes = await getConnectionCredentials({
    config: apiConfig.getOAuthAPIConfig(),
    logger,
    credentialsId: connector.connectionId,
  });
  if (credentialsRes.isErr()) {
    logger.error({ connectorId }, "Failed to retrieve credentials");
    return new Err({
      code: "invalid_credentials",
      error: Error("Failed to retrieve credentials"),
    });
  }
  // Narrow the type of credentials to just the username/password variant
  const credentials = credentialsRes.value.credential.content;
  if (!isTypeGuard(credentials)) {
    throw new Error(
      `Invalid credentials types, type guard: ${isTypeGuard.name}`
    );
  }
  return new Ok({
    connector,
    credentials,
  });
};

/**
   * Saves the nodes that the user has access to in the database.
   * We save only the nodes that the admin has given us access to.
   * 
   * Example of permissions: {
        "MY_DB.PUBLIC": "read",
        "MY_DB.SAMPLE_DATA.CATS": "read",
        "MY_DB.SAMPLE_DATA.DOGS": "none",
        "MY_OTHER_DB": "node",
      }
   */
export const saveNodesFromPermissions = async ({
  connectorId,
  permissions,
}: {
  connectorId: ModelId;
  permissions: Record<string, string>;
}): Promise<Result<void, Error>> => {
  const FRONT_PERMISSIONS_ALLOWED = ["read", "none"];
  for (const [internalId, permission] of Object.entries(permissions)) {
    if (!FRONT_PERMISSIONS_ALLOWED.includes(permission)) {
      throw new Error(
        `Invalid permission: ${permission}. Action: make sure that the front end only sends permissions from the list: ${FRONT_PERMISSIONS_ALLOWED.join(
          ", "
        )}.`
      );
    }

    const [database, schema, table] = internalId.split(".");
    const internalType = getContentNodeTypeFromInternalId(internalId);
    switch (internalType) {
      case "database":
        {
          const existingDb = await RemoteDatabaseModel.findOne({
            where: { connectorId, internalId },
          });

          if (permission === "read") {
            if (!existingDb) {
              await RemoteDatabaseModel.create({
                connectorId,
                internalId,
                name: database as string,
                permission: "selected",
              });
            } else {
              await existingDb.update({ permission: "selected" });
            }
          } else if (permission === "none" && existingDb) {
            await existingDb.update({ permission: "unselected" });
          }
        }
        break;
      case "schema":
        {
          const existingSchema = await RemoteSchemaModel.findOne({
            where: {
              connectorId,
              internalId,
            },
          });

          if (permission === "read") {
            if (!existingSchema) {
              await RemoteSchemaModel.create({
                connectorId,
                internalId,
                name: schema as string,
                databaseName: database as string,
                permission: "selected",
              });
            } else {
              await existingSchema.update({ permission: "selected" });
            }
          } else if (permission === "none" && existingSchema) {
            await existingSchema.update({ permission: "unselected" });
          }
        }
        break;
      case "table":
        {
          const existingTable = await RemoteTableModel.findOne({
            where: {
              connectorId,
              internalId,
            },
          });

          if (permission === "read") {
            if (!existingTable) {
              await RemoteTableModel.create({
                connectorId,
                internalId,
                name: table as string,
                schemaName: schema as string,
                databaseName: database as string,
                permission: "selected",
              });
            } else {
              await existingTable.update({ permission: "selected" });
            }
          } else if (permission === "none" && existingTable) {
            // Do not destoy immediately, let the sync clean it up (and the core dependencies with it).
            await existingTable.update({ permission: "unselected" });
          }
        }
        break;
      default:
        assertNever(internalType);
    }
  }

  return new Ok(undefined);
};
