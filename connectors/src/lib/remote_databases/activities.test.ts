import { describe, expect, it, vi } from "vitest";

import {
  deleteDataSourceFolder,
  upsertDataSourceFolder,
  upsertDataSourceRemoteTable,
} from "@connectors/lib/data_sources";
import {
  RemoteDatabaseModel,
  RemoteSchemaModel,
  RemoteTableModel,
} from "@connectors/lib/models/remote_databases";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import type { DataSourceConfig } from "@connectors/types";
import { INTERNAL_MIME_TYPES } from "@connectors/types";

import { sync } from "./activities";

// Mock the data_sources module to spy on upsertTable
vi.mock(import("@connectors/lib/data_sources"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    upsertDataSourceFolder: vi.fn(),
    upsertDataSourceRemoteTable: vi.fn(),
    deleteDataSourceFolder: vi.fn(),
  };
});

vi.mock("@connectors/logger/logger", () => ({
  default: {
    child: () => ({
      info: vi.fn(),
      error: vi.fn(),
    }),
    info: vi.fn(),
  },
}));

describe("sync remote databases", async () => {
  it("should create new database when it doesn't exist and is read granted", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "test-db",
      name: "test-db",
      permission: "selected",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test-db",
          schemas: [],
        },
      ],
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      tags: [],
    });

    const remoteDB = await RemoteDatabaseModel.findOne({
      where: {
        internalId: "test-db",
      },
    });

    expect(remoteDB?.lastUpsertedAt).toBeInstanceOf(Date);
    expect(remoteDB?.permission).toBe("selected");

    expect(upsertDataSourceFolder).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      folderId: "test-db",
      title: "test-db",
      parents: ["test-db"],
      parentId: null,
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.DATABASE,
    });
  });

  it("should create new schema when it doesn't exist and is read granted", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "test-db",
      name: "test-db",
      permission: "selected",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test-db",
          schemas: [
            {
              name: "test-schema",
              database_name: "test-db",
              tables: [],
            },
          ],
        },
      ],
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      tags: [],
    });

    const remoteDatabase = await RemoteDatabaseModel.findOne({
      where: {
        internalId: "test-db",
      },
    });

    expect(remoteDatabase?.lastUpsertedAt).toBeInstanceOf(Date);
    expect(remoteDatabase?.permission).toBe("selected");

    const remoteSchema = await RemoteSchemaModel.findOne({
      where: {
        internalId: "test-db.test-schema",
      },
    });

    expect(remoteSchema?.lastUpsertedAt).toBeInstanceOf(Date);
    expect(remoteSchema?.permission).toBe("inherited");

    expect(upsertDataSourceFolder).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      folderId: "test-db.test-schema",
      title: "test-schema",
      parents: ["test-db.test-schema", "test-db"],
      parentId: "test-db",
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.SCHEMA,
    });
  });

  it("should create new table when it doesn't exist and is read granted", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "test-db",
      name: "test-db",
      permission: "selected",
      connectorId: connector.id,
    });

    await RemoteSchemaModel.create({
      internalId: "test-db.test-schema",
      name: "test-schema",
      databaseName: "test-db",
      permission: "selected",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test-db",
          schemas: [
            {
              name: "test-schema",
              database_name: "test-db",
              tables: [
                {
                  name: "test-table",
                  database_name: "test-db",
                  schema_name: "test-schema",
                },
              ],
            },
          ],
        },
      ],
    };

    const internalTableIdToRemoteTableId = (
      internalTableId: string
    ): string => {
      if (internalTableId === "test-db.test-schema.test-table") {
        return "custom-remote-table-id";
      }
      return internalTableId;
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      internalTableIdToRemoteTableId,
      tags: ["my-test-tag"],
    });

    const remoteTable = await RemoteTableModel.findOne({
      where: {
        internalId: "test-db.test-schema.test-table",
      },
    });

    expect(remoteTable?.lastUpsertedAt).toBeInstanceOf(Date);
    expect(remoteTable?.permission).toBe("inherited");

    expect(upsertDataSourceRemoteTable).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      tableId: "test-db.test-schema.test-table",
      tableName: "test-db.test-schema.test-table",
      remoteDatabaseTableId: "custom-remote-table-id",
      remoteDatabaseSecretId: connector.connectionId,
      tableDescription: "",
      parents: [
        "test-db.test-schema.test-table",
        "test-db.test-schema",
        "test-db",
      ],
      parentId: "test-db.test-schema",
      title: "test-table",
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.TABLE,
      tags: ["my-test-tag"],
    });
  });

  it("should delete unused database when it exists but is not in remoteDBTree", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "unused-db",
      name: "unused-db",
      permission: "inherited",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test-db",
          schemas: [],
        },
      ],
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      tags: [],
    });

    expect(deleteDataSourceFolder).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      folderId: "unused-db",
    });

    const oldRemoteDB = await RemoteDatabaseModel.findOne({
      where: {
        internalId: "unused-db",
      },
    });

    expect(oldRemoteDB).toBeNull();

    expect(await RemoteDatabaseModel.count()).toEqual(0);
  });

  it("should handle empty remoteDBTree", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await sync({
      remoteDBTree: undefined,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      tags: [],
    });

    expect(await RemoteDatabaseModel.count()).toEqual(0);
    expect(await RemoteSchemaModel.count()).toEqual(0);
    expect(await RemoteTableModel.count()).toEqual(0);
    expect(deleteDataSourceFolder).not.toHaveBeenCalled();
    expect(upsertDataSourceFolder).not.toHaveBeenCalled();
    expect(upsertDataSourceRemoteTable).not.toHaveBeenCalled();
  });

  it("should correctly handle dots in database, schema, and table names", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "test__DUST_DOT__db",
      name: "test.db",
      permission: "selected",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test.db",
          schemas: [
            {
              name: "test.schema",
              database_name: "test.db",
              tables: [
                {
                  name: "test.table",
                  database_name: "test.db",
                  schema_name: "test.schema",
                },
              ],
            },
          ],
        },
      ],
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      tags: ["my-test-tag"],
    });

    // Check database model
    const remoteDatabase = await RemoteDatabaseModel.findOne({
      where: {
        internalId: "test__DUST_DOT__db",
      },
    });
    expect(remoteDatabase).not.toBeNull();
    expect(remoteDatabase?.name).toBe("test.db");

    // Check schema model
    const remoteSchema = await RemoteSchemaModel.findOne({
      where: {
        internalId: "test__DUST_DOT__db.test__DUST_DOT__schema",
      },
    });
    expect(remoteSchema).not.toBeNull();
    expect(remoteSchema?.name).toBe("test.schema");
    expect(remoteSchema?.databaseName).toBe("test.db");

    // Check table model
    const remoteTable = await RemoteTableModel.findOne({
      where: {
        internalId:
          "test__DUST_DOT__db.test__DUST_DOT__schema.test__DUST_DOT__table",
      },
    });
    expect(remoteTable).not.toBeNull();
    expect(remoteTable?.name).toBe("test.table");
    expect(remoteTable?.schemaName).toBe("test.schema");
    expect(remoteTable?.databaseName).toBe("test.db");

    // Verify upsertDataSourceFolder calls
    expect(upsertDataSourceFolder).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      folderId: "test__DUST_DOT__db",
      title: "test.db",
      parents: ["test__DUST_DOT__db"],
      parentId: null,
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.DATABASE,
    });

    expect(upsertDataSourceFolder).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      folderId: "test__DUST_DOT__db.test__DUST_DOT__schema",
      title: "test.schema",
      parents: [
        "test__DUST_DOT__db.test__DUST_DOT__schema",
        "test__DUST_DOT__db",
      ],
      parentId: "test__DUST_DOT__db",
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.SCHEMA,
    });

    // Verify upsertDataSourceRemoteTable call
    expect(upsertDataSourceRemoteTable).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      tableId:
        "test__DUST_DOT__db.test__DUST_DOT__schema.test__DUST_DOT__table",
      tableName:
        "test__DUST_DOT__db.test__DUST_DOT__schema.test__DUST_DOT__table",
      remoteDatabaseTableId:
        "test__DUST_DOT__db.test__DUST_DOT__schema.test__DUST_DOT__table",
      remoteDatabaseSecretId: connector.connectionId,
      tableDescription: "",
      parents: [
        "test__DUST_DOT__db.test__DUST_DOT__schema.test__DUST_DOT__table",
        "test__DUST_DOT__db.test__DUST_DOT__schema",
        "test__DUST_DOT__db",
      ],
      parentId: "test__DUST_DOT__db.test__DUST_DOT__schema",
      title: "test.table",
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.TABLE,
      tags: ["my-test-tag"],
    });
  });

  it("should use internalTableIdToRemoteTableId in upsertDataSourceRemoteTable calls", async () => {
    const dataSourceConfig: DataSourceConfig = {
      workspaceId: "test-workspace-id",
      workspaceAPIKey: "test-workspace-api-key",
      dataSourceId: "test-data-source-id",
    };

    const connector = await ConnectorResource.makeNew(
      "bigquery",
      {
        connectionId: "test-connection-id",
        workspaceId: dataSourceConfig.workspaceId,
        dataSourceId: dataSourceConfig.dataSourceId,
        workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      },
      {
        useMetadataForDBML: false,
      }
    );

    await RemoteDatabaseModel.create({
      internalId: "test-db",
      name: "test-db",
      permission: "selected",
      connectorId: connector.id,
    });

    const remoteDBTree = {
      databases: [
        {
          name: "test-db",
          schemas: [
            {
              name: "test-schema",
              database_name: "test-db",
              tables: [
                {
                  name: "test-table",
                  database_name: "test-db",
                  schema_name: "test-schema",
                },
              ],
            },
          ],
        },
      ],
    };

    const internalTableIdToRemoteTableId = (
      internalTableId: string
    ): string => {
      if (internalTableId === "test-db.test-schema.test-table") {
        return "custom-remote-table-id";
      }
      return internalTableId;
    };

    await sync({
      remoteDBTree,
      connector: connector,
      mimeTypes: INTERNAL_MIME_TYPES.BIGQUERY,
      internalTableIdToRemoteTableId,
      tags: ["my-test-tag"],
    });

    expect(upsertDataSourceRemoteTable).toHaveBeenCalledWith({
      dataSourceConfig: dataSourceConfig,
      tableId: "test-db.test-schema.test-table",
      tableName: "test-db.test-schema.test-table",
      remoteDatabaseTableId: "custom-remote-table-id",
      remoteDatabaseSecretId: connector.connectionId,
      tableDescription: "",
      parents: [
        "test-db.test-schema.test-table",
        "test-db.test-schema",
        "test-db",
      ],
      parentId: "test-db.test-schema",
      title: "test-table",
      mimeType: INTERNAL_MIME_TYPES.BIGQUERY.TABLE,
      tags: ["my-test-tag"],
    });
  });
});
