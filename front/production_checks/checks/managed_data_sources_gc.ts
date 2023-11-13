import { QueryTypes, Sequelize } from "sequelize";

import { ConnectorProvider } from "@app/lib/connectors_api";
import { Err, Ok, Result } from "@app/lib/result";
import { CheckFunction } from "@app/production_checks/types/check";

const { CORE_DATABASE_URI, FRONT_DATABASE_URI, CONNECTORS_DATABASE_URI } =
  process.env;

type CoreDSDocument = {
  id: number;
  document_id: string;
};

type DocumentsChecker = (
  documents: CoreDSDocument[],
  connectors_sequelize: Sequelize
) => Promise<Result<void, unknown>>;

export const managedDataSourcesGcCheck: CheckFunction = async (
  checkName,
  reportSuccess,
  reportFailure
) => {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });
  const front_sequelize = new Sequelize(FRONT_DATABASE_URI as string, {
    logging: false,
  });
  const connectorsSequelize = new Sequelize(CONNECTORS_DATABASE_URI as string, {
    logging: false,
  });

  const managedDsData = await front_sequelize.query(
    'SELECT id, "connectorId", "connectorProvider", "dustAPIProjectId"\
     FROM data_sources WHERE "connectorId" IS NOT NULL',
    { type: QueryTypes.SELECT }
  );
  const managedDs = managedDsData as {
    id: number;
    connectorId: number;
    connectorProvider: string;
    dustAPIProjectId: string;
  }[];
  for (const ds of managedDs) {
    const coreDsData = await core_sequelize.query(
      `SELECT id FROM data_sources WHERE "project" = :dustAPIProjectId`,
      {
        replacements: {
          dustAPIProjectId: ds.dustAPIProjectId,
        },
        type: QueryTypes.SELECT,
      }
    );
    const coreDs = coreDsData as { id: number }[];
    if (coreDs.length === 0) {
      await reportFailure(
        { frontDataSourceId: ds.id },
        `No core data source found for front data source`
      );
      continue;
    }
    const coreDocumentsData = await core_sequelize.query(
      `SELECT * FROM data_sources_documents WHERE "data_source" = :coreDsId AND status = 'latest'`,
      {
        replacements: {
          coreDsId: coreDs[0].id,
        },
        type: QueryTypes.SELECT,
      }
    );

    const coreDocuments = coreDocumentsData as {
      id: number;
      document_id: string;
      tags_array: string[];
    }[];
    const checkFiles =
      CHECK_FILES_BY_TYPE[ds.connectorProvider as ConnectorProvider];
    if (checkFiles) {
      const result = await checkFiles(coreDocuments, connectorsSequelize);
      if (result.isErr()) {
        await reportFailure(
          {
            frontDataSourceId: ds.id,
            coreDataSourceId: coreDs[0].id,
            conncetorId: ds.connectorId,
            connectorProvider: ds.connectorProvider,
            errorPayload: result.error,
          },
          `Files from managed Data Sources not garbage collected.`
        );
      } else {
        await reportSuccess({ frontDataSourceId: ds.id });
      }
    }
  }
};

export const CHECK_FILES_BY_TYPE: Record<
  ConnectorProvider,
  DocumentsChecker | undefined
> = {
  slack: undefined,
  notion: undefined,
  github: undefined,
  google_drive: async (
    documents: CoreDSDocument[],
    connectorsSequelize: Sequelize
  ): Promise<Result<void, unknown>> => {
    const results: CoreDSDocument[] = [];
    do {
      const slice = documents.splice(0, 100);
      const dustFileIds = slice.map((d) => d.document_id);

      const documentsData = await connectorsSequelize.query(
        'SELECT id as "googleDriveFileId", "dustFileId" FROM google_drive_files WHERE "dustFileId" IN (:documentIds)',
        {
          replacements: {
            documentIds: dustFileIds,
          },
          type: QueryTypes.SELECT,
        }
      );
      const documentsNotGCed = documentsData as {
        googleDriveFileId: number;
        dustFileId: string;
      }[];
      if (documentsNotGCed.length !== dustFileIds.length) {
        const connectorSideFileIds = new Set(
          documentsNotGCed.map((d) => d.dustFileId)
        );

        const missing = slice.filter(
          (coreDocument) => !connectorSideFileIds.has(coreDocument.document_id)
        );
        results.push(...missing);
      }
    } while (documents.length > 0);

    if (results.length === 0) {
      return new Ok(void 0);
    } else {
      return new Err({coreDocuments: results});
    }
  },
};
