import _ from "lodash";

import { getCorePrimaryDbConnection } from "@app/lib/production_checks/utils";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { makeSId } from "@app/lib/resources/string_ids";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async ({ execute }, logger) => {
  const coreSequelize = getCorePrimaryDbConnection();

  // Find all upsert_document files. That's ~ 40K files in US.
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

  // Set URLs finishing with the suffixes to null.
  const batchSize = 100;

  const batches = _.chunk(filesURLSuffixes, batchSize);
  for (const batch of batches) {
    logger.info({ batchSize: batch.length, execute }, "Updating batch");
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
