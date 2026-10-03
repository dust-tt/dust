import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

interface TableInfo {
  table_name: string;
}

export async function getTablesWithColumn(
  client: Sequelize,
  { columnName }: { columnName: string }
): Promise<string[]> {
  const rows = await client.query<TableInfo>(
    `
        SELECT table_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND column_name = :columnName;
      `,
    {
      replacements: { columnName },
      type: QueryTypes.SELECT,
    }
  );

  return rows.map((row) => row.table_name);
}

interface ForeignKeyInfo {
  referencing_table: string;
  referencing_column: string;
  referenced_table: string;
  referenced_column: string;
}

export async function getForeignKeys(
  client: Sequelize
): Promise<ForeignKeyInfo[]> {
  const rows = await client.query<ForeignKeyInfo>(
    `
        SELECT
            kcu.table_name AS referencing_table,
            kcu.column_name AS referencing_column,
            ccu.table_name AS referenced_table,
            ccu.column_name AS referenced_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public';
      `,
    {
      type: QueryTypes.SELECT,
    }
  );

  return rows;
}

export async function getUserReferencingColumns(
  client: Sequelize
): Promise<Record<string, string[]>> {
  const foreignKeys = await getForeignKeys(client);
  const result: Record<string, string[]> = {};
  for (const fk of foreignKeys) {
    if (fk.referenced_table === "users" && fk.referenced_column === "id") {
      if (!result[fk.referencing_table]) {
        result[fk.referencing_table] = [];
      }
      result[fk.referencing_table].push(fk.referencing_column);
    }
  }

  logger.info(
    {
      userReferencingColumns: result,
    },
    "User referencing columns"
  );

  return result;
}

/**
 * Every user id the workspace's rows point at, through the columns that reference
 * users.id, whatever the table. Members are only part of it: a superuser acting from
 * poke, a former member whose membership row is gone, an editor from another workspace
 * all leave references the relocation has to carry.
 */
export async function getWorkspaceReferencedUserIds(
  client: Sequelize,
  { workspaceId }: { workspaceId: ModelId }
): Promise<ModelId[]> {
  const [userColumnsByTable, workspaceTables] = await Promise.all([
    getUserReferencingColumns(client),
    getTablesWithColumn(client, { columnName: "workspaceId" }),
  ]);
  const workspaceTableSet = new Set(workspaceTables);

  const userIds = new Set<ModelId>();
  for (const [table, columns] of Object.entries(userColumnsByTable)) {
    if (!workspaceTableSet.has(table)) {
      continue;
    }
    for (const column of columns) {
      // Identifiers come from information_schema, not from user input.
      const rows = await client.query<{ id: ModelId }>(
        `SELECT DISTINCT "${column}" AS id FROM "${table}" WHERE "workspaceId" = :workspaceId AND "${column}" IS NOT NULL`,
        { replacements: { workspaceId }, type: QueryTypes.SELECT }
      );
      for (const { id } of rows) {
        userIds.add(id);
      }
    }
  }

  return [...userIds];
}
