import assert from "assert";
import { hash as blake3 } from "blake3";
import * as fs from "fs";
import { Sequelize } from "sequelize";
import { v4 as uuidv4 } from "uuid";

import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { makeScript } from "@app/scripts/helpers";

const { CORE_DATABASE_URI } = process.env;

function coreNewId() {
  const u = uuidv4();
  const b = blake3(u);

  return Buffer.from(b).toString("hex");
}

makeScript({}, async ({ execute }, logger) => {
  const corePrimary = new Sequelize(CORE_DATABASE_URI as string, {
    logging: false,
  });

  const coreData = await corePrimary.query(
    `SELECT id, project, data_source_id, internal_id FROM data_sources`
  );

  const coreDataSources = coreData[0] as {
    id: number;
    project: number;
    data_source_id: string;
    internal_id: string;
  }[];

  const frontDataSources = await DataSourceResource.model.findAll({});

  logger.info(
    {
      coreDataSources: coreDataSources.length,
      frontDataSources: frontDataSources.length,
    },
    "Retrieved data sources"
  );

  const coreDataSourcesById = coreDataSources.reduce(
    (acc, ds) => {
      acc[`${ds.project}-${ds.data_source_id}`] = ds;
      return acc;
    },
    {} as Record<string, (typeof coreDataSources)[0]>
  );

  const frontDataSourcesById = frontDataSources.reduce(
    (acc, ds) => {
      acc[`${ds.dustAPIProjectId}-${ds.dustAPIDataSourceId}`] = ds;
      return acc;
    },
    {} as Record<string, (typeof frontDataSources)[0]>
  );

  // First check if we need to repair garbage collect anything.

  for (const coreDataSource of coreDataSources) {
    if (
      !frontDataSourcesById[
        `${coreDataSource.project}-${coreDataSource.data_source_id}`
      ]
    ) {
      logger.error(
        {
          coreDataSource,
        },
        "Core Data source not found in front"
      );
      return;
    }
  }
  // Use 20240524_clean_up_orphaned_core_data_sources.ts if any found here.

  for (const frontDataSource of frontDataSources) {
    if (
      !coreDataSourcesById[
        `${frontDataSource.dustAPIProjectId}-${frontDataSource.dustAPIDataSourceId}`
      ]
    ) {
      logger.error(
        {
          frontDataSource,
        },
        "Front Data Source not found in core"
      );
      return;
    }
  }
  // Attempt to delete in poke if any found here.

  let coreRevert = "";
  let frontRevert = "";

  for (const coreDataSource of coreDataSources) {
    const newId = coreNewId();
    const frontDataSource =
      frontDataSourcesById[
        `${coreDataSource.project}-${coreDataSource.data_source_id}`
      ];
    assert(frontDataSource, "unreachable");
    assert(
      frontDataSource.dustAPIDataSourceId === coreDataSource.data_source_id,
      "mismatch in core/front data_source_id"
    );

    const coreRevertQuery = `UPDATE data_sources SET data_source_id='${coreDataSource.data_source_id}' WHERE id=${coreDataSource.id};`;
    coreRevert += coreRevertQuery + "\n";
    const frontRevertQuery = `UPDATE data_sources SET "dustAPIDataSourceId"='${frontDataSource.dustAPIDataSourceId}' WHERE id=${frontDataSource.id};`;
    frontRevert += frontRevertQuery + "\n";

    if (execute) {
      await corePrimary.query(
        "UPDATE data_sources SET data_source_id = :data_source_id WHERE id = :id",
        {
          replacements: {
            id: coreDataSource.id,
            data_source_id: newId,
          },
        }
      );

      await frontDataSource.update({
        dustAPIDataSourceId: newId,
      });

      logger.info(
        {
          old_data_source_id: coreDataSource.data_source_id,
          new_data_source_id: newId,
        },
        "[LIVE] Updated core/front data_source_id"
      );
    } else {
      logger.info(
        {
          old_data_source_id: coreDataSource.data_source_id,
          new_data_source_id: newId,
        },
        "[DRY] Updated core/front data_source_id"
      );
    }
  }

  fs.writeFileSync("core_revert.sql", coreRevert);
  fs.writeFileSync("front_revert.sql", frontRevert);
});
