import type { Sequelize } from "sequelize";
import { QueryTypes } from "sequelize";

interface TableInfo {
  table_name: string;
}

export async function getTablesWithWorkspaceId(
  client: Sequelize
): Promise<string[]> {
  const rows = await client.query<TableInfo>(
    `
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'workspaceId';
  `,
    {
      type: QueryTypes.SELECT,
    }
  );

  return rows.map((row) => row.table_name);
}

/**
 * Interface describing the result returned by getForeignKeys().
 */
interface ForeignKeyInfo {
  referencing_table: string;
  referencing_column: string;
  referenced_table: string;
  referenced_column: string;
}

async function getForeignKeys(client: Sequelize): Promise<ForeignKeyInfo[]> {
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

/**
 * Interface describing a generic adjacency list to store graph edges
 * keyed by table name.
 */
type Graph = Record<string, Set<string>>;

/**
 * Build a topological order of tables based on their foreign-key relationships.
 * Use a Kahn-based algorithm to produce a viable load order for the tables.
 * So that tables with foreign-key dependencies are loaded in the correct order.
 */
export async function getTopologicallySortedTables(
  client: Sequelize
): Promise<string[]> {
  // 1) Retrieve all tables that have a "workspaceId".
  const tables = await getTablesWithWorkspaceId(client);

  // 2) Retrieve all foreign keys from the DB.
  const foreignKeys = await getForeignKeys(client);

  // 3) Build a dependency graph + in-degree map (for Kahn's Algorithm).

  // Make a set of tables so we can filter out relationships that might reference
  // tables outside of the "tables" set (tables including `workspaceId`).
  const tableSet = new Set(tables);

  // Initialize adjacency list and in-degrees for all tables of interest.
  const graph: Graph = {};
  const inDegree: Record<string, number> = {};

  for (const tableName of tableSet) {
    graph[tableName] = new Set<string>();
    inDegree[tableName] = 0;
  }

  // For each foreign key, referencing_table depends on referenced_table
  // So we have an edge from referenced_table -> referencing_table.
  foreignKeys.forEach(({ referencing_table, referenced_table }) => {
    // Skip self-referencing tables and only consider tables that we care about.
    if (
      referencing_table !== referenced_table && // Filter out self-references.
      tableSet.has(referencing_table) &&
      tableSet.has(referenced_table)
    ) {
      if (graph[referenced_table].has(referencing_table)) {
        // Skip if the foreign key is duplicated (e.g: clones table).
        return;
      }

      // Add referencing_table to adjacency list of referenced_table.
      graph[referenced_table].add(referencing_table);

      // Increase the in-degree of the referencing_table.
      inDegree[referencing_table] += 1;
    }
  });

  // 4) Perform Kahn's Algorithm on the graph

  // Step 4a: Find all nodes with 0 in-degree.
  const queue: string[] = Object.entries(inDegree)
    .filter(([_, deg]) => deg === 0)
    .map(([tbl]) => tbl);

  const sortedTables: string[] = [];

  // Step 4b: Process the queue.
  while (queue.length > 0) {
    const current = queue.shift() as string;
    sortedTables.push(current);

    // Decrease in-degree for each table reachable from current.
    for (const neighbor of graph[current]) {
      inDegree[neighbor] -= 1;

      // If in-degree becomes 0, add it to the queue.
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // Step 4c: If we haven't resolved all tables, there must be a cycle.
  if (sortedTables.length !== tableSet.size) {
    throw new Error(
      "Cycle detected among foreign-key references. Cannot perform valid topological sort."
    );
  }

  // Return the sorted list.
  return sortedTables;
}
