import { Storage } from "@google-cloud/storage";
import { createHash } from "blake3";
import pino, { LoggerOptions } from "pino";
import { Sequelize } from "sequelize";

import { CheckFunction } from "../types/check";

const { CORE_DATABASE_URI, SERVICE_ACCOUNT, DUST_DATA_SOURCES_BUCKET } =
  process.env;

export const scrubDeletedCoreDocumentVersionsCheck: CheckFunction = async (
  checkName,
  logger,
  reportSuccess
) => {
  if (!CORE_DATABASE_URI) {
    throw new Error("Env var CORE_DATABASE_URI is not defined");
  }
  if (!SERVICE_ACCOUNT) {
    throw new Error("Env var SERVICE_ACCOUNT is not defined");
  }

  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

  const deletedDocumentsData = await core_sequelize.query(
    `SELECT * FROM data_sources_documents WHERE status = 'deleted'`
  );

  const deletedDocuments = deletedDocumentsData[0] as {
    id: number;
    created: number;
    data_source: number;
    document_id: string;
    hash: string;
  }[];

  logger.info(
    {
      documentCount: deletedDocuments.length,
    },
    "Found deleted core documents to scrub"
  );

  const chunks = [];
  for (let i = 0; i < deletedDocuments.length; i += 32) {
    chunks.push(deletedDocuments.slice(i, i + 32));
  }

  const seen: Set<string> = new Set();
  let deletedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((d) => {
        return (async () => {
          const done = await scrubDocument({
            logger,
            core_sequelize,
            seen,
            storage,
            data_source: d.data_source,
            document_id: d.document_id,
            deletedAt: d.created,
            hash: d.hash,
          });
          if (done) {
            deletedCount++;
          }
        })();
      })
    );
  }

  logger.info(
    {
      deletedCount,
    },
    "Done scrubbing deleted core document versions"
  );

  reportSuccess({
    deletedCount,
  });
};

async function scrubDocument({
  logger,
  core_sequelize,
  storage,
  seen,
  data_source,
  document_id,
  deletedAt,
  hash,
}: {
  logger: pino.Logger<LoggerOptions>;
  core_sequelize: Sequelize;
  storage: Storage;
  seen: Set<string>;
  data_source: number;
  document_id: string;
  deletedAt: number;
  hash: string;
}) {
  if (!DUST_DATA_SOURCES_BUCKET) {
    throw new Error("Env var DUST_DATA_SOURCES_BUCKET is not defined");
  }

  // Process same version of same document only once.
  const uid = `${data_source}-${document_id}-${hash}`;
  if (seen.has(uid)) {
    return false;
  }

  const moreRecentSameHash = await core_sequelize.query(
    `SELECT id FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND hash = :hash AND status != 'deleted' AND created >= :deletedAt LIMIT 1`,
    {
      replacements: {
        data_source: data_source,
        document_id: document_id,
        hash: hash,
        deletedAt: deletedAt,
      },
    }
  );

  if (moreRecentSameHash[0].length > 0) {
    // Skipping as there is a more recent version with the same hash
    return false;
  }

  const dataSourceData = await core_sequelize.query(
    `SELECT * FROM data_sources WHERE id = :data_source`,
    {
      replacements: {
        data_source: data_source,
      },
    }
  );

  if (dataSourceData[0].length === 0) {
    throw new Error(`Could not find data source ${data_source}`);
  }

  const dataSource = dataSourceData[0][0] as {
    id: number;
    project: number;
    internal_id: string;
  };

  const hasher = createHash();
  hasher.update(Buffer.from(document_id));
  const documentIdHash = hasher.digest("hex");

  const path = `${dataSource.project}/${dataSource.internal_id}/${documentIdHash}/${hash}`;

  const [files] = await storage
    .bucket(DUST_DATA_SOURCES_BUCKET)
    .getFiles({ prefix: path });

  await Promise.all(
    files.map((f) => {
      if (!seen.has(f.name)) {
        seen.add(f.name);
        logger.info(
          {
            path: f.name,
            documentId: document_id,
            documentHash: hash,
            dataSourceProject: dataSource.project,
            dataSourceInternalId: dataSource.internal_id,
            dataSourceId: dataSource.id,
          },
          "Scrubbing"
        );

        return f.delete();
      }
    })
  );

  await core_sequelize.query(
    `DELETE FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND hash = :hash AND status = 'deleted'`,
    {
      replacements: {
        data_source: data_source,
        document_id: document_id,
        hash: hash,
      },
    }
  );

  logger.info(
    {
      documentId: document_id,
      documentHash: hash,
      dataSourceProject: dataSource.project,
      dataSourceInternalId: dataSource.internal_id,
      dataSourceId: dataSource.id,
      filesCount: files.length,
    },
    "Scrubbed deleted versions"
  );

  seen.add(uid);

  return true;
}
