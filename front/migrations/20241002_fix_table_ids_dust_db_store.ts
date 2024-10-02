import { Sequelize } from "sequelize";

const { DATABASES_STORE_DATABASE_URI, LIVE = false } = process.env;
import * as _ from "lodash";

const file_tables_rows_unique_table_ids = [
  "10002__test__b00442bd9f",
  "10073__managed-notion__notion-774291cb-c1ac-4674-ae0a-7b45d708512c",
  // ...
];

const file_core_project_id_data_source_ids = [
  {
    data_source_id: "0ecf4b1b-0b1b-4b1b-8b1b-0b1b4b1b4b1b",
    project_id: "0ecf4b1b-0b1b-4b1b-8b1b-0b1b4b1b4b1b",
    is_notion: true,
  },
  //   ...
];

async function main() {
  const sequelize = new Sequelize(DATABASES_STORE_DATABASE_URI as string, {
    logging: false,
  });

  // For each datasource...
  for (const [
    i,
    { data_source_id, project_id, is_notion },
  ] of file_core_project_id_data_source_ids.entries()) {
    console.log(
      `\n\n------------\n` +
        `Processing data source (ds_id=${data_source_id}, project_id=${project_id}, is_notion=${is_notion})` +
        ` -- ${i + 1}/${file_core_project_id_data_source_ids.length}` +
        `\n------------\n`
    );

    const allTableIds = file_tables_rows_unique_table_ids.filter((tId) =>
      tId.startsWith(`${project_id}__`)
    );
    const tablesRecord: Record<
      string,
      { oldUniqueId: string | null; newUniqueId: string | null }
    > = {};

    for (const tUniqueId of allTableIds) {
      const [, dsNameOrId, tId] = tUniqueId.split("__");
      const isNewUniqueId = dsNameOrId === data_source_id;
      const globalId = `${project_id}__${tId}`;
      const tableRecord = tablesRecord[globalId] || {
        oldUniqueId: null,
        newUniqueId: null,
      };
      if (isNewUniqueId) {
        tableRecord.newUniqueId = tUniqueId;
      } else {
        tableRecord.oldUniqueId = tUniqueId;
      }
      tablesRecord[globalId] = tableRecord;
    }

    if (is_notion) {
      // Special case for notion.
      // For each table, we need to fetch the content for all the rows.
      // For each row, we need to figure out the right ID:
      //  -- if the row has `_dust_id` or `__dust_id` in `content` -> use that
      //  -- if the row has a `row_id` that is a UUID (let's say any string longer than 16 chars) -> use that
      //  -- otherwise, we are screwed (but shouldn't be any)
      // Then we group the rows by the ID, and for each group figure out which one is latest based on `created`. Delete all the others.

      // Once that is done, we can rename the tables.

      // We process tables 4 by 4
      const chunkSize = 4;
      const chunks = _.chunk(Object.values(tablesRecord), chunkSize);
      for (const c of chunks) {
        await Promise.all(
          c.map(async ({ oldUniqueId, newUniqueId }) => {
            // Fetch all rows for the table, based on both old and new unique IDs
            const rows = (
              await sequelize.query(
                `
              SELECT
                id, table_id, row_id, content, created
              FROM tables_rows 
              WHERE table_id = '${oldUniqueId}' OR table_id = '${newUniqueId}'`
              )
            )[0] as {
              id: number;
              table_id: string;
              row_id: string;
              content: string;
              created: number;
            }[];

            // For each row, determine the right "row_id". Group rows by that ID.
            const rowsByRowId = _.groupBy(rows, (r) => {
              const content = JSON.parse(r.content);
              if (content._dust_id || content.__dust_id) {
                return content._dust_id || content.__dust_id;
              }
              if (r.row_id && r.row_id.length > 16) {
                return r.row_id;
              }
              throw new Error(
                `Invalid row (table_id=${r.table_id} row_id=${r.row_id}): ${JSON.stringify(content)}`
              );
            });

            // Determine the target table ID
            const tableId = newUniqueId || oldUniqueId;
            if (!tableId) {
              throw new Error(`Unreachable: no tableId`);
            }
            const [, , tId] = tableId.split("__");
            const targetTableId = `${project_id}__${data_source_id}__${tId}`;

            // Iterate over the groups
            for (const [rowId, rowGroup] of Object.entries(rowsByRowId)) {
              // For each group, determine the latest row based on `created`
              const latestRow = _.maxBy(rowGroup, (r) => r.created);
              if (!latestRow) {
                throw new Error(`Unreachable: no latest row for ${rowId}`);
              }

              // ALl other rows are to be deleted
              const rowsToDelete = rowGroup.filter(
                (r) => r.id !== latestRow.id
              );
              console.log(`Deleting ${rowsToDelete.length} stale notion rows`);
              if (LIVE) {
                await sequelize.query(
                  `DELETE FROM tables_rows WHERE id IN (${rowsToDelete
                    .map((r) => r.id)
                    .join(",")})`
                );
              }

              // Create the target `content` object by removing the `_dust_id` and `__dust_id` fields
              const parsedContent = JSON.parse(latestRow.content);
              delete parsedContent._dust_id;
              delete parsedContent.__dust_id;
              const targetContent = JSON.stringify(parsedContent);

              // Update the surviving row to point to use the target table ID and the correct row ID, and update the content
              console.log(`Updating notion row ${latestRow.id}`);
              if (LIVE) {
                await sequelize.query(
                  `UPDATE tables_rows
                SET table_id = '${targetTableId}' 
                  AND row_id = '${rowId}' 
                  AND content = '${targetContent}' 
                WHERE id = ${latestRow.id}`
                );
              }
            }
          })
        );
      }
    } else {
      // Data source is not a notion DS.
      // We process tables 16 by 16
      const chunkSize = 16;
      const chunks = _.chunk(Object.values(tablesRecord), chunkSize);

      for (const c of chunks) {
        await Promise.all(
          c.map(async ({ oldUniqueId, newUniqueId }) => {
            if (!oldUniqueId && newUniqueId) {
              // No need to rename anything, everything is already correct
              return;
            }

            if (oldUniqueId && !newUniqueId) {
              // We only have old IDs, so we just rename them
              const tableId = oldUniqueId;
              const [, , tId] = tableId.split("__");
              const targetTableId = `${project_id}__${data_source_id}__${tId}`;
              console.log(`Renaming table ${tableId} to ${targetTableId}`);
              if (LIVE) {
                await sequelize.query(
                  `UPDATE tables_rows SET table_id = '${targetTableId}' WHERE table_id = '${tableId}'`
                );
              }
            } else {
              // We have a mix of old and new IDs -- we can just delete the old ones
              const tableId = oldUniqueId;
              console.log(`Deleting table ${tableId}`);
              if (LIVE) {
                await sequelize.query(
                  `DELETE FROM tables_rows WHERE table_id = '${tableId}'`
                );
              }
            }
          })
        );
      }
    }
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
