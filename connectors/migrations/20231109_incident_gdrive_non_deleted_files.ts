import { Sequelize } from "sequelize";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteFromDataSource } from "@connectors/lib/data_sources";
import { Connector, GoogleDriveFiles } from "@connectors/lib/models";

// To be run from connectors with `CORE_DATABASE_URI` and `FRONT_DATABASE_URI` set.
const { CORE_DATABASE_URI, FRONT_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
    logging: false,
  });

  const gDriveConnectors = await Connector.findAll({
    where: {
      type: "google_drive",
    },
  });

  console.log(`Processing ${gDriveConnectors.length} google drive connectors`);

  for (const c of gDriveConnectors) {
    const files = await GoogleDriveFiles.findAll({
      where: {
        connectorId: c.id,
      },
      attributes: ["id", "driveFileId", "dustFileId"],
    });

    console.log(`Connector ${c.id}: found ${files.length} files`);

    const fileHash = files.reduce((acc, f) => {
      acc[f.dustFileId] = f.id;
      return acc;
    }, {} as { [key: string]: number });

    // find dustProjectId from front based on workspaceId and connectorName
    const dsData = await front_sequelize.query(
      'SELECT * FROM data_sources WHERE "connectorId" = :connectorId',
      {
        replacements: {
          connectorId: c.id.toString(),
        },
      }
    );

    if (dsData[0].length === 0) {
      throw new Error(`No data source found for connector ${c.id}`);
    }
    const ds = dsData[0][0] as { dustAPIProjectId: string };
    const dustAPIProjectId = parseInt(ds.dustAPIProjectId);

    console.log(`Found dustAPIProjectId: ${dustAPIProjectId}`);

    const coreDsData = await core_sequelize.query(
      `SELECT * FROM data_sources WHERE "project" = :dustAPIProjectId`,
      {
        replacements: {
          dustAPIProjectId: dustAPIProjectId,
        },
      }
    );

    if (coreDsData[0].length === 0) {
      throw new Error(
        `No core data source found for dustAPIProjectId ${dustAPIProjectId}`
      );
    }
    const coreDs = coreDsData[0][0] as { data_source_id: string; id: number };
    const coreDsId = coreDs.id;

    console.log(
      `Found core DustDataSource: ${coreDsId} ${coreDs.data_source_id}`
    );

    const coreDocumentsData = await core_sequelize.query(
      `SELECT * FROM data_sources_documents WHERE "data_source" = :coreDsId AND status = 'latest'`,
      {
        replacements: {
          coreDsId: coreDsId,
        },
      }
    );

    const documents = coreDocumentsData[0] as {
      id: number;
      document_id: string;
      tags_array: string[];
    }[];

    console.log(`Found ${documents.length} core documents`);

    const documentsToDelete = documents.filter((d) => {
      return fileHash[d.document_id] === undefined;
    });

    for (const d of documentsToDelete) {
      console.log(
        `Deleting document ${d.id} ${d.document_id}, tags #${d.tags_array.join(
          ", #"
        )}`
      );
      if (LIVE) {
        await deleteDocument(c, d.document_id);
      }
    }

    console.log(
      `>>> Found ${documentsToDelete.length} documents to delete for workspace ${c.workspaceId}`
    );
  }
}

async function deleteDocument(connector: Connector, fileId: string) {
  const dataSourceConfig = dataSourceConfigFromConnector(connector);
  await deleteFromDataSource(dataSourceConfig, fileId);
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
