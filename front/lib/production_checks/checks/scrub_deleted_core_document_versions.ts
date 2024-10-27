import { CoreAPI } from "@dust-tt/types";
import type { LoggerOptions } from "pino";
import type pino from "pino";

import config from "@app/lib/api/config";
import type { CheckFunction } from "@app/lib/production_checks/types";
import { getCoreReplicaDbConnection } from "@app/lib/production_checks/utils";

const { CORE_DATABASE_URI } = process.env;

export const scrubDeletedCoreDocumentVersionsCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess,
  reportFailure,
  heartbeat
) => {
  if (!CORE_DATABASE_URI) {
    throw new Error("Env var CORE_DATABASE_URI is not defined");
  }

  const coreReplica = getCoreReplicaDbConnection();

  let lastSeenId = 0;
  let totalScrubbedCount = 0;

  do {
    // paginate by id
    const deletedDocumentsData = await coreReplica.query(
      `SELECT dsd.id, dsd.created, dsd.document_id, dsd.hash, ds.data_source_id, ds.project
        FROM data_sources_documents dsd
        JOIN data_sources ds ON ds.id = dsd.data_source
        WHERE dsd.status = 'deleted' AND dsd.id > ${lastSeenId}
        ORDER BY dsd.id LIMIT 1000`
    );

    const deletedDocuments = deletedDocumentsData[0] as {
      id: number;
      project: number;
      created: number;
      data_source_id: string;
      document_id: string;
      hash: string;
    }[];

    logger.info(
      {
        documentCount: deletedDocuments.length,
      },
      "Found a page of deleted core documents to scrub"
    );

    const chunks = [];
    for (let i = 0; i < deletedDocuments.length; i += 32) {
      chunks.push(deletedDocuments.slice(i, i + 32));
    }

    let scrubbedCount = 0;

    for (let i = 0; i < chunks.length; i++) {
      heartbeat();
      const chunk = chunks[i];
      await Promise.all(
        chunk.map((d) => {
          return (async () => {
            const count = await scrubDocument({
              logger,
              project: d.project,
              dataSourceId: d.data_source_id,
              documentId: d.document_id,
            });
            scrubbedCount += count;
          })();
        })
      );
    }

    logger.info(
      {
        deletedCount: scrubbedCount,
      },
      "Done scrubbing deleted core document versions for this page"
    );
    totalScrubbedCount += scrubbedCount;
    lastSeenId =
      deletedDocuments.length > 0
        ? deletedDocuments[deletedDocuments.length - 1].id
        : -1;
  } while (lastSeenId !== -1);

  reportSuccess({
    totalScrubbedCount,
  });
};

async function scrubDocument({
  logger,
  project,
  dataSourceId,
  documentId,
}: {
  logger: pino.Logger<LoggerOptions>;
  project: number;
  dataSourceId: string;
  documentId: string;
}) {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  const sRes = await coreAPI.scrubDataSourceDocumentDeletedVersions({
    projectId: `${project}`,
    dataSourceId,
    documentId,
  });

  if (sRes.isErr()) {
    logger.error(
      {
        documentId,
        dataSourceProject: project,
        dataSourceId: dataSourceId,
        error: sRes.error,
      },
      "Failed to scrub versions"
    );
    throw new Error(`Failed to scrub versions: ${sRes.error}`);
  }

  logger.info(
    {
      documentId,
      dataSourceProject: project,
      dataSourceId: dataSourceId,
      versionsScrubbed: sRes.value.versions.length,
    },
    "Scrubbed deleted versions"
  );

  return sRes.value.versions.length;
}
