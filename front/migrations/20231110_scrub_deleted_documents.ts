import { Storage } from "@google-cloud/storage";
import { createHash } from "blake3";
import { Sequelize } from "sequelize";

const {
  CORE_DATABASE_URI,
  SERVICE_ACCOUNT,
  DUST_DATA_SOURCES_BUCKET,
  LIVE = false,
} = process.env;

async function main() {
  const now = new Date().getTime();

  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

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

  console.log(
    `Found ${deletedDocuments.length} deleted core documents to process`
  );

  const chunks = [];
  for (let i = 0; i < deletedDocuments.length; i += 32) {
    chunks.push(deletedDocuments.slice(i, i + 32));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (d) => {
        return scrubDocument(
          core_sequelize,
          d.data_source,
          d.document_id,
          d.created,
          d.hash
        );
      })
    );
  }

  console.log(`SCRUBBED_UP_UNTIL ${now}`);
}

const seen = new Set();

async function scrubDocument(
  core_sequelize: Sequelize,
  data_source: number,
  document_id: string,
  deletedAt: number,
  hash: string
) {
  // Process same version of same document only once.
  const uid = `${data_source}-${document_id}-${hash}`;
  if (seen.has(uid)) {
    return;
  }

  const moreRecentSameHash = await core_sequelize.query(
    `SELECT id FROM data_sources_documents WHERE data_source = :data_source AND document_id = :document_id AND hash = :hash AND status != 'deleted' AND created > :deletedAt LIMIT 1`,
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
    return;
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

  if (LIVE) {
    const hasher = createHash();
    hasher.update(Buffer.from(document_id));
    const documentIdHash = hasher.digest("hex");

    const path = `${dataSource.project}/${dataSource.internal_id}/${documentIdHash}/${hash}`;

    const storage = new Storage({ keyFilename: SERVICE_ACCOUNT });

    const [files] = await storage
      .bucket(DUST_DATA_SOURCES_BUCKET || "")
      .getFiles({ prefix: path });

    // if (files.length >= 1) {
    //   console.log(files.map((f) => f.name));
    //   throw new Error("Unexpected number of files > 1");
    // }

    console.log(`DELETING versions of ${document_id} with hash ${hash}`);

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

    if (files.length === 0) {
      return;
    }

    await Promise.all(
      files.map((f) => {
        if (!seen.has(f.name)) {
          seen.add(f.name);
          console.log(`DELETING ${f.name}`);
          return f.delete();
        }
      })
    );
  }

  seen.add(uid);
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
