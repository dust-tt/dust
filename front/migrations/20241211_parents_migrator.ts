import type { ConnectorProvider } from "@dust-tt/types";
import { isConnectorProvider } from "@dust-tt/types";
import { Sequelize } from "sequelize";

// import { QdrantClient } from "@qdrant/js-client-rest";
import { Authenticator } from "@app/lib/auth";
import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import { makeScript, runOnAllWorkspaces } from "@app/scripts/helpers";
import assert from "assert";

const { QDRANT_CLUSTER_0_URL, QDRANT_CLUSTER_0_API_KEY } = process.env;

const client = new QdrantClient({
  url: QDRANT_URL,
  apiKey: QDRANT_API_KEY,
});

type MigratorAction = "transform" | "clean";

const isMigratorAction = (action: string): action is MigratorAction => {
  return ["transform", "clean"].includes(action);
};

type ProviderMigrator = {
  transformer: (parents: string[]) => string[];
  cleaner: (parents: string[]) => string[];
};

const DOCUMENT_QUERY_BATCH_SIZE = 128;
const DOCUMENT_CONCURRENCY = 8;

async function migrateDataSource({
  provider,
  dataSource,
  execute,
}: {
  provider: ConnectorProvider;
  dataSource: DataSourceModel;
  execute: boolean;
}) {
  const corePrimary = getCorePrimaryDbConnection();

  // Retrieve the core data source.
  const [coreDataSourceRows] = (await corePrimary.query(
    `SELECT id, data_source_id FROM data_sources WHERE project = ? AND data_source_id = ?`,
    {
      replacements: [
        dataSource.dustAPIProjectId,
        dataSource.dustAPIDataSourceId,
      ],
    }
  )) as { id: number; data_source_id: string }[][];

  assert(
    coreDataSourceRows.length === 1 &&
      coreDataSourceRows[0].data_source_id === dataSource.dustAPIDataSourceId,
    "Core data source mismatch"
  );

  const coreDataSourceId = coreDataSourceRows[0].id;

  // for all documents in the data source (can be big)
  let nextId = 0;

  for (;;) {
    const [coreDocumentRows] = (await corePrimary.query(
      "SELECT id, parents, document_id, hash FROM data_sources_documents " +
        "WHERE data_source = ? AND id > ? ORDER BY id ASC LIMIT ?",
      {
        replacements: [
          coreDataSourceRows[0].id,
          nextId,
          DOCUMENT_QUERY_BATCH_SIZE,
        ],
      }
    )) as {
      id: number;
      parents: string[];
      document_id: string;
      hash: string;
    }[][];

    nextId = coreDocumentRows[coreDocumentRows.length - 1].id;

    if (coreDocumentRows.length === 0) {
      break;
    }

    // concurrentExecutor on documents
  }

  // for all the tables in the data source (can be big)
}

async function migrateAll({
  provider,
  execute,
}: {
  provider: ConnectorProvider;
  execute: boolean;
}) {
  // retrieve all data sources for the provider
  const dataSources = await DataSourceModel.findAll({
    where: {
      connectorProvider: provider,
    },
  });

  for (const dataSource of dataSources) {
    await migrateDataSource({ provider, dataSource, execute });
  }
}

const migrators: Record<ConnectorProvider, ProviderMigrator | null> = {
  slack: {
    transformer: (parents) => {
      return parents;
    },
    cleaner: (parents) => {
      return parents;
    },
  },
  google_drive: null,
  microsoft: null,
  github: null,
  notion: null,
  snowflake: null,
  webcrawler: null,
  zendesk: null,
  confluence: null,
  intercom: null,
};

makeScript(
  {
    provider: {
      type: "string",
      required: true,
    },
    action: {
      type: "string",
      required: true,
    },
  },
  async ({ provider, action, execute }) => {
    if (!isMigratorAction(action)) {
      console.error(
        `Invalid action ${action}, supported actions are "transform" and "clean"`
      );
      return;
    }
    if (!isConnectorProvider(provider)) {
      console.error(`Invalid provider ${provider}`);
      return;
    }
    if (!migrators[provider]) {
      console.error(`No migrator found for provider ${provider}`);
      return;
    }

    await migrateAll({ provider, execute });
  }
);
