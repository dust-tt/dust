import { Sequelize } from "sequelize";

// To be run from connectors with `CORE_DATABASE_URI`
const { CORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const core_sequelize = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const dataSourcesData = await core_sequelize.query(
    `SELECT id, config_json FROM data_sources`
  );

  const dataSources = dataSourcesData[0] as {
    id: number;
    config_json: string;
  }[];

  console.log(`Found ${dataSources.length} data sources to process`);

  const chunks = [];
  for (let i = 0; i < dataSources.length; i += 32) {
    chunks.push(dataSources.slice(i, i + 32));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map(async (d) => {
        return processDataSource(core_sequelize, d);
      })
    );
  }
}

async function processDataSource(
  core_sequelize: Sequelize,
  d: { id: number; config_json: string }
) {
  console.log(">", d.config_json);

  const config = JSON.parse(d.config_json);

  delete config.use_cache;
  config.qdrant_config = null;

  console.log("<", JSON.stringify(config));

  if (LIVE) {
    await core_sequelize.query(
      `UPDATE data_sources SET config_json = :config WHERE id = :id`,
      {
        replacements: {
          id: d.id,
          config: JSON.stringify(config),
        },
      }
    );
  }
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
