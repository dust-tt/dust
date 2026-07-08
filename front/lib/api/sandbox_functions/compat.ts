import type {
  DatabaseColumn,
  FunctionState,
} from "@app/lib/api/sandbox_functions/manifests";
import isEqual from "lodash/isEqual";

// Pure function state compatibility diff: the new state of the
// function being published is compared against the stored state of every other function
// of the same pod declaring the same database ("siblings"), plus the publishing function's own
// previous state for the additive-but-breaking check.
//
// - BLOCK (structural): a sibling references something the new state removes or changes
//   (table missing; column missing; type/notNull/primaryKey/autoIncrement differ).
// - BLOCK (additive-but-breaking): a new NOT NULL column without default on a table that
//   already exists in any sibling state or in this function's own previous state.
// - WARN (mode drift): same column, same type, different mode.
// - WARN (unique tightening): new unique index on a table present in a sibling state.
// - Indexes never block; hasDefault changes never block.

export interface SiblingState {
  slug: string;
  state: FunctionState | null;
}

export interface CompatBlock {
  database: string;
  table: string;
  column: string | null;
  // Slugs whose published bundles (or, for the additive check, whose live rows) break.
  affectedFunctions: string[];
  reason: string;
}

export interface CompatWarning {
  kind: "mode_drift" | "unique_tightening";
  database: string;
  table: string;
  subject: string; // column name (mode_drift) or index name (unique_tightening)
  message: string;
}

export interface CompatDiff {
  blocks: CompatBlock[];
  warnings: CompatWarning[];
}

export interface StaleSiblingNote {
  slug: string;
  databases: string[];
}

interface BlockAccumulatorEntry {
  database: string;
  table: string;
  column: string | null;
  affectedFunctions: Set<string>;
  reason: string;
}

export function diffStateAgainstSiblings({
  newState,
  previousState,
  siblings,
}: {
  newState: FunctionState | null;
  previousState: FunctionState | null;
  siblings: SiblingState[];
}): CompatDiff {
  if (newState === null) {
    // A function declaring no databases cannot break siblings: its bundle opens nothing, and
    // no DDL runs. (Tables it used to declare stay live; reconcile never drops.)
    return { blocks: [], warnings: [] };
  }

  const blocks = new Map<string, BlockAccumulatorEntry>();
  const modeDrifts = new Map<
    string,
    {
      database: string;
      table: string;
      column: string;
      type: string;
      newMode: string | null;
      siblingMode: string | null;
      slugs: Set<string>;
    }
  >();
  const uniqueTightenings = new Map<
    string,
    {
      database: string;
      table: string;
      indexName: string;
      columns: string[];
      slugs: Set<string>;
    }
  >();

  const addBlock = (
    entry: Omit<BlockAccumulatorEntry, "affectedFunctions">,
    affectedSlug: string
  ) => {
    const key = [entry.database, entry.table, entry.column, entry.reason].join(
      "\u0000"
    );
    const existing = blocks.get(key);
    if (existing) {
      existing.affectedFunctions.add(affectedSlug);
    } else {
      blocks.set(key, { ...entry, affectedFunctions: new Set([affectedSlug]) });
    }
  };

  for (const [database, newDb] of Object.entries(newState.databases)) {
    for (const sibling of siblings) {
      const siblingDb = sibling.state?.databases[database];
      if (siblingDb === undefined) {
        continue;
      }

      for (const [tableName, siblingTable] of Object.entries(
        siblingDb.tables
      )) {
        const newTable = newDb.tables[tableName];
        if (newTable === undefined) {
          addBlock(
            {
              database,
              table: tableName,
              column: null,
              reason: `removes table ${database}.${tableName}`,
            },
            sibling.slug
          );
          continue;
        }

        // Structural checks: everything the sibling references must survive unchanged.
        for (const [columnName, siblingColumn] of Object.entries(
          siblingTable.columns
        )) {
          const newColumn = newTable.columns[columnName];
          if (newColumn === undefined) {
            addBlock(
              {
                database,
                table: tableName,
                column: columnName,
                reason: `removes column ${database}.${tableName}.${columnName}`,
              },
              sibling.slug
            );
            continue;
          }
          const structuralChange = describeStructuralChange(
            siblingColumn,
            newColumn
          );
          if (structuralChange !== null) {
            addBlock(
              {
                database,
                table: tableName,
                column: columnName,
                reason: `changes ${database}.${tableName}.${columnName}: ${structuralChange}`,
              },
              sibling.slug
            );
          } else if (newColumn.mode !== siblingColumn.mode) {
            // Same storage type, different (de)serialization contract: warn, never block.
            const key = [
              database,
              tableName,
              columnName,
              newColumn.mode,
              siblingColumn.mode,
            ].join("\u0000");
            const drift = modeDrifts.get(key);
            if (drift) {
              drift.slugs.add(sibling.slug);
            } else {
              modeDrifts.set(key, {
                database,
                table: tableName,
                column: columnName,
                type: newColumn.type,
                newMode: newColumn.mode,
                siblingMode: siblingColumn.mode,
                slugs: new Set([sibling.slug]),
              });
            }
          }
        }

        // Additive-but-breaking: new NOT NULL column without default on a pre-existing table.
        addNotNullAdditionBlocks({
          database,
          tableName,
          newColumns: newTable.columns,
          existingColumns: siblingTable.columns,
          affectedSlug: sibling.slug,
          addBlock,
        });

        // Unique tightening: a unique index the sibling's state does not carry.
        for (const [indexName, index] of Object.entries(newTable.indexes)) {
          if (!index.unique) {
            continue;
          }
          const siblingIndex = siblingTable.indexes[indexName];
          if (siblingIndex === undefined || !siblingIndex.unique) {
            const key = [database, tableName, indexName].join("\u0000");
            const tightening = uniqueTightenings.get(key);
            if (tightening) {
              tightening.slugs.add(sibling.slug);
            } else {
              uniqueTightenings.set(key, {
                database,
                table: tableName,
                indexName,
                columns: index.columns,
                slugs: new Set([sibling.slug]),
              });
            }
          }
        }
      }
    }

    // Own previous state participates in the additive-but-breaking check only: live rows
    // predate the new column, so NOT NULL without default breaks even without siblings.
    const previousDb = previousState?.databases[database];
    if (previousDb !== undefined) {
      for (const [tableName, previousTable] of Object.entries(
        previousDb.tables
      )) {
        const newTable = newDb.tables[tableName];
        if (newTable === undefined) {
          continue;
        }
        addNotNullAdditionBlocks({
          database,
          tableName,
          newColumns: newTable.columns,
          existingColumns: previousTable.columns,
          affectedSlug: "(this function's previous publish)",
          addBlock,
        });
      }
    }
  }

  const warnings: CompatWarning[] = [
    ...[...modeDrifts.values()].map((drift): CompatWarning => {
      const slugs = [...drift.slugs].sort();
      return {
        kind: "mode_drift",
        database: drift.database,
        table: drift.table,
        subject: drift.column,
        message:
          `${drift.database}.${drift.table}.${drift.column}: this publish declares ` +
          `${drift.type}${formatMode(drift.newMode)}; ${slugs.join(", ")} ` +
          `declare${slugs.length === 1 ? "s" : ""} ${drift.type}${formatMode(drift.siblingMode)}. ` +
          `Align on the shared databases/${drift.database}.db.ts and republish, ` +
          `or republish the siblings if the new mode is intended.`,
      };
    }),
    ...[...uniqueTightenings.values()].map((tightening): CompatWarning => {
      const slugs = [...tightening.slugs].sort();
      return {
        kind: "unique_tightening",
        database: tightening.database,
        table: tightening.table,
        subject: tightening.indexName,
        message:
          `${tightening.database}.${tightening.table}: new unique index ` +
          `"${tightening.indexName}" (${tightening.columns.join(", ")}) tightens a table ` +
          `other functions use (${slugs.join(", ")}); writes violating uniqueness will now fail.`,
      };
    }),
  ];

  return {
    blocks: [...blocks.values()].map((entry) => ({
      database: entry.database,
      table: entry.table,
      column: entry.column,
      affectedFunctions: [...entry.affectedFunctions].sort(),
      reason: entry.reason,
    })),
    warnings,
  };
}

function addNotNullAdditionBlocks({
  database,
  tableName,
  newColumns,
  existingColumns,
  affectedSlug,
  addBlock,
}: {
  database: string;
  tableName: string;
  newColumns: Record<string, DatabaseColumn>;
  existingColumns: Record<string, DatabaseColumn>;
  affectedSlug: string;
  addBlock: (
    entry: { database: string; table: string; column: string; reason: string },
    affectedSlug: string
  ) => void;
}): void {
  for (const [columnName, newColumn] of Object.entries(newColumns)) {
    if (
      existingColumns[columnName] === undefined &&
      newColumn.notNull &&
      !newColumn.hasDefault
    ) {
      addBlock(
        {
          database,
          table: tableName,
          column: columnName,
          reason: `adds NOT NULL column ${database}.${tableName}.${columnName} without a default on a table that already exists`,
        },
        affectedSlug
      );
    }
  }
}

function describeStructuralChange(
  siblingColumn: DatabaseColumn,
  newColumn: DatabaseColumn
): string | null {
  if (newColumn.type !== siblingColumn.type) {
    return `type ${siblingColumn.type} -> ${newColumn.type}`;
  }
  if (newColumn.notNull !== siblingColumn.notNull) {
    return newColumn.notNull ? "adds NOT NULL" : "removes NOT NULL";
  }
  if (newColumn.primaryKey !== siblingColumn.primaryKey) {
    return "changes the primary key";
  }
  if (newColumn.autoIncrement !== siblingColumn.autoIncrement) {
    return "changes autoincrement";
  }
  return null;
}

function formatMode(mode: string | null): string {
  return mode === null ? " (no mode)" : ` mode=${mode}`;
}

/**
 * After a compatible publish: siblings whose stored state for a shared database differs from
 * the newly stored one. Their bundles keep working (the diff said so), but their embedded schema
 * files are stale until republished.
 */
export function computeStaleSiblings(
  newState: FunctionState | null,
  siblings: SiblingState[]
): StaleSiblingNote[] {
  if (newState === null) {
    return [];
  }

  const notes: StaleSiblingNote[] = [];
  for (const sibling of siblings) {
    if (sibling.state === null || sibling.state === undefined) {
      continue;
    }
    const staleDatabases: string[] = [];
    for (const [database, newDb] of Object.entries(newState.databases)) {
      const siblingDb = sibling.state.databases[database];
      if (siblingDb !== undefined && !isEqual(siblingDb, newDb)) {
        staleDatabases.push(database);
      }
    }
    if (staleDatabases.length > 0) {
      notes.push({ slug: sibling.slug, databases: staleDatabases.sort() });
    }
  }
  return notes.sort((a, b) => a.slug.localeCompare(b.slug));
}
