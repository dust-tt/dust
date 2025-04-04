import type { Sequelize } from "sequelize";
import { Op, QueryTypes } from "sequelize";

import {
  getCorePrimaryDbConnection,
  getFrontPrimaryDbConnection,
} from "@app/lib/production_checks/utils";
import { DataSourceModel } from "@app/lib/resources/storage/models/data_source";
import type Logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { makeSId } from "@app/lib/resources/string_ids";
import _ from "lodash";

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();

  // That's ~ 40K files in US
  const filesToBackfill = await FileModel.findAll({
    where: {
      useCase: "upsert_document",
    },
    order: [["id", "ASC"]],
  });

  const filesURLSuffixes = filesToBackfill.map((f) => {
    const sId = makeSId("file", { id: f.id, workspaceId: f.workspaceId });
    return `/files/${sId}`;
  });

  // In batches of 1000, set URLs finishing with the suffixes to null.
  const batchSize = 1000;
  const batches = _.chunk(filesURLSuffixes, batchSize);
  for (const batch of batches) {
    if (execute) {
      await coreSequelize.query(
        `UPDATE data_sources_nodes dsn
         SET dsn.source_url = NULL
         FROM (
          SELECT UNNEST(ARRAY [:sourceUrlSuffixes]::text[]) AS source_url_suffix
         ) unnested
         WHERE dsn.source_url LIKE unnested.source_url_suffix`,
        {
          replacements: {
            sourceUrlSuffix: batch.map((s) => `%${s}`),
          },
        }
      );
    }
  }
});
