import * as _ from "lodash";
import { Sequelize } from "sequelize";

import { DataSource } from "@app/lib/resources/storage/models/data_source";
import { makeScript } from "@app/scripts/helpers";
const { CORE_DATABASE_URI } = process.env;

const CLUSTER_TO_MIGRATE = "dedicated-2";

makeScript(
  {
    dsType: {
      type: "string",
      demandOption: true,
    },
  },
  async ({ dsType }) => {
    if (!CORE_DATABASE_URI) {
      throw new Error("CORE_DATABASE_URI is not defined");
    }

    const coreSequelize = new Sequelize(CORE_DATABASE_URI, { logging: false });

    const dataSources: { project_id: number; data_source_id: string }[] = [];

    const [dsData] = (await coreSequelize.query(`
      SELECT * FROM data_sources;
    `)) as [any[], { rowCount?: number }];

    dsData.forEach(async (ds) => {
      const config = JSON.parse(ds.config_json);
      if (
        config.qdrant_config &&
        config.qdrant_config.cluster === CLUSTER_TO_MIGRATE
      ) {
        dataSources.push({
          project_id: parseInt(ds.project),
          data_source_id: ds.data_source_id,
        });
      }
    });

    const folders: { project_id: number; data_source_id: string }[] = [];
    const websites: { project_id: number; data_source_id: string }[] = [];

    for (const chunk of _.chunk(dataSources, 16)) {
      await Promise.all(
        chunk.map(async (ds) => {
          const fds = await DataSource.findOne({
            where: {
              dustAPIProjectId: ds.project_id.toString(),
            },
          });

          if (!fds) {
            console.error(
              `Data source with dustAPIProjectId ${ds.project_id} not found`
            );
            return;
          }

          if (fds.connectorProvider === null) {
            folders.push(ds);
          }
          if (fds.connectorProvider === "webcrawler") {
            websites.push(ds);
          }
        })
      );
    }

    if (dsType === "folders") {
      folders.forEach((ds) => {
        console.log(JSON.stringify(ds));
      });
    }
    if (dsType === "websites") {
      websites.forEach((ds) => {
        console.log(JSON.stringify(ds));
      });
    }
  }
);
