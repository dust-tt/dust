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
