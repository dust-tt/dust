import { promises as fs } from "fs";
import * as _ from "lodash";
import { Sequelize } from "sequelize";

const { DATABASES_STORE_DATABASE_URI, LIVE = false } = process.env;

async function main() {
  const sequelize = new Sequelize(DATABASES_STORE_DATABASE_URI as string, {
    logging: false,
  });

  const file_tables_rows_unique_table_ids = (
    await fs.readFile("./tables_rows_unique_table_ids.csv")
  )
    .toString()
    .split("\n");

  const file_core_project_id_data_source_ids = (
    await fs.readFile("./data_sources_project_data_source_ids.jsonl")
  )
    .toString()
    .split("\n")
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        return null;
      }
    })
    .filter((x) => !!x) as Array<{
    data_source_id: string;
    project: number;
    is_notion: boolean;
  }>;

  const tableIdsByProjectId = _.groupBy(
    file_tables_rows_unique_table_ids,
    (t) => t.split("__")[0]
  );

  // For each datasource...
  for (const [
    i,
    { data_source_id, project: project_id, is_notion },
  ] of file_core_project_id_data_source_ids.entries()) {
    // 20241004 -- running migration again for notion only, skip all others
    if (!is_notion) {
      continue;
    }
    const allTableIds = tableIdsByProjectId[project_id.toString()] || [];
    if (allTableIds.length === 0) {
      console.log(
        `No table IDs found for data source (ds_id=${data_source_id}, project_id=${project_id}, is_notion=${is_notion})`
      );
      continue;
    }

    console.log(
      `\n\n------------\n` +
        `Processing data source (ds_id=${data_source_id}, project_id=${project_id}, is_notion=${is_notion})` +
        ` -- (${i + 1}/${file_core_project_id_data_source_ids.length}): ${allTableIds.length} unique table IDs found` +
        `\n------------\n`
    );

    const tablesRecord: Record<
      string,
      { oldUniqueIds: string[]; newUniqueId: string | null }
    > = {};

    for (const tUniqueId of allTableIds) {
      const [, dsNameOrId, ...rest] = tUniqueId.split("__");
      const tId = rest.join("__");
      const isNewUniqueId = dsNameOrId === data_source_id;
      const globalId = `${project_id}__${tId}`;
      const tableRecord = tablesRecord[globalId] || {
        oldUniqueIds: [],
        newUniqueId: null,
      };
      if (isNewUniqueId) {
        tableRecord.newUniqueId = tUniqueId;
      } else {
        tableRecord.oldUniqueIds.push(tUniqueId);
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
          c.map(async ({ oldUniqueIds, newUniqueId }) => {
            // Fetch all rows for the table, based on both old and new unique IDs
            const rows = (
              await sequelize.query(
                `
              SELECT
                id, table_id, row_id, content, created
              FROM tables_rows 
              WHERE table_id IN (
              ${[...oldUniqueIds, newUniqueId].map((id) => `'${id}'`)}
              )`
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
              let id: string | null = null;
              if (content._dust_id || content.__dust_id) {
                id = content._dust_id || content.__dust_id;
              } else if (r.row_id && r.row_id.length > 16) {
                id = r.row_id;
              }
              if (!id) {
                throw new Error(
                  `Invalid row (table_id=${r.table_id} row_id=${r.row_id}): ${JSON.stringify(content)}`
                );
              }
              if (id?.startsWith("notion-")) {
                id = id.slice(7);
              }
              return id;
            });

            // Determine the target table ID
            const tableId = newUniqueId || oldUniqueIds[0];
            if (!tableId) {
              throw new Error(`Unreachable: no tableId`);
            }
            const [, , ...rest] = tableId.split("__");
            const tId = rest.join("__");
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
              if (rowsToDelete.length) {
                console.log(
                  `Deleting ${rowsToDelete.length} stale notion rows`
                );
                if (LIVE) {
                  await sequelize.query(
                    `DELETE FROM tables_rows WHERE id IN (${rowsToDelete
                      .map((r) => r.id)
                      .join(",")})`
                  );
                }
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
                  , row_id = '${rowId}'
                  , content = :content
                WHERE id = ${latestRow.id}`,
                  {
                    replacements: {
                      content: targetContent,
                    },
                  }
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
          c.map(async ({ oldUniqueIds, newUniqueId }) => {
            if (!oldUniqueIds.length && newUniqueId) {
              // No need to rename anything, everything is already correct
              return;
            }

            if (oldUniqueIds.length && !newUniqueId) {
              // We only have old IDs, so we just rename them
              const [, , ...rest] = oldUniqueIds[0].split("__");
              const tId = rest.join("__");
              const targetTableId = `${project_id}__${data_source_id}__${tId}`;
              console.log(
                `Renaming tables ${oldUniqueIds} to ${targetTableId}`
              );
              if (LIVE) {
                await sequelize.query(
                  `UPDATE tables_rows SET table_id = '${targetTableId}' WHERE table_id IN (
                  ${oldUniqueIds.map((id) => `'${id}'`).join(",")}
                  )`
                );
              }
            } else {
              // We have a mix of old and new IDs -- we can just delete the old ones
              console.log(`Deleting tables ${oldUniqueIds}`);
              if (LIVE) {
                await sequelize.query(
                  `DELETE FROM tables_rows WHERE table_id IN (
                  ${oldUniqueIds.map((id) => `'${id}'`).join(",")}
                  )`
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
