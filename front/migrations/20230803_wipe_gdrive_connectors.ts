import { Sequelize } from "sequelize";

import { dustManagedCredentials } from "@app/lib/api/credentials";
import { CoreAPI } from "@app/lib/core_api";
import { DataSource } from "@app/lib/models";

const { CONNECTORS_DB = "" } = process.env;

async function main() {
  // get all gdrive data sources
  // - for each ds:
  //    - delete all gridve files in conn db
  //    - delete datasource in core
  //    - create datasource in core
  const connectors_sequelize = new Sequelize(CONNECTORS_DB, {
    logging: false,
  });

  const ds = await DataSource.findAll({
    where: {
      connectorProvider: "google-drive",
    },
  });

  for (const d of ds) {
    const connectorId = d.connectorId;
    await connectors_sequelize.query(
      `DELETE FROM google_drive_files WHERE "connectorId" = ${connectorId}`
    );
    await CoreAPI.deleteDataSource({
      projectId: d.dustAPIProjectId,
      dataSourceName: d.name,
    });
    await CoreAPI.createDataSource({
      projectId: d.dustAPIProjectId,
      dataSourceId: d.name,
      config: {
        provider_id: "openai",
        model_id: "text-embedding-ada-002",
        splitter_id: "base_v0",
        max_chunk_size: 256,
        use_cache: false,
      },
      credentials: dustManagedCredentials(),
    });
  }
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
