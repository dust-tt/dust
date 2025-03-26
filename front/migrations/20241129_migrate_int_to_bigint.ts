import assert from "assert";
import chalk from "chalk";
import type { PoolClient } from "pg";
import { Pool } from "pg";

import { makeScript } from "@app/scripts/helpers";
import { assertNever } from "@app/types";

// Types.
interface MigrationConfig {
  tableName: string;
  schemaName?: string;
  batchSize: number;
  timeoutSeconds?: number;
  dryRun: boolean;
}

interface CompositeIndex {
  indexName: string;
  columns: string[];
  isUnique: boolean;
  whereClause: string;
}

interface ReferencingTable {
  schema: string;
  tableName: string;
  foreignKeyColumn: string;
  constraintName: string;
  deleteAction?: string;
  updateAction?: string;
}

interface MigrationProgress {
  tableName: string;
  totalRows: number;
  migratedRows: number;
  progressPercentage: number;
}

interface MainTableSwitchConfig {
  currentColumn: string; // e.g., 'id'
  newColumn: string; // e.g., 'id_new'
  legacyColumn: string; // e.g., 'id_legacy'
  sequenceName: string; // e.g., 'table_id_seq'
  indexName: string; // e.g., 'table_pkey_bigint'
}

interface ReferencingColumnSwitchConfig {
  currentColumn: string; // e.g., "groupId"
  newColumn: string; // e.g., "groupId_new"
  legacyColumn: string; // e.g., "groupId_legacy"
  constraintName: string; // e.g., "group_memberships_groupId_fkey"
}

const MigrationSteps = [
  "setup",
  "backfill",
  "pre-cutover",
  "cutover",
  "rollback",
  "cleanup",
] as const;
type MigrationStepType = (typeof MigrationSteps)[number];

const MAIN_ID_COLUMN = "id";

export const COLUMN_TYPE = {
  INT: "int",
  BIGINT: "bigint",
} as const;

export const SYNC_DIRECTION = {
  TO_BIGINT: "to_bigint",
  TO_LEGACY: "to_legacy",
} as const;

type ColumnType = (typeof COLUMN_TYPE)[keyof typeof COLUMN_TYPE];
type SyncDirection = (typeof SYNC_DIRECTION)[keyof typeof SYNC_DIRECTION];

export const createColumnName = {
  new: (baseColumn: string) => `${baseColumn}_new` as const,
  legacy: (baseColumn: string) => `${baseColumn}_legacy` as const,
};

function assertInProduction(value: unknown, message?: string): asserts value {
  if (process.env.NODE_ENV !== "development") {
    assert(value, message);
  }
}

// If table name is too long, create an abbreviation
const shortenTableName = (tableName: string) =>
  tableName.length > 35
    ? tableName
        .split("_")
        .map((word) => word[0])
        .join("") // e.g., 'ncrce'
    : tableName;

export const createIndexName = {
  primary: (tableName: string, column: ColumnType) =>
    `${tableName}_pkey_${column}` as const,
  foreign: (tableName: string, columnName: string, column: ColumnType) =>
    `${shortenTableName(tableName)}_${columnName}_fk_${column}` as const,
};

export const createTriggerNames = {
  // For primary key (main table)
  pk: (tableName: string, direction: SyncDirection) => ({
    trigger: `${tableName}_pk_sync_${direction}` as const,
    function: `${tableName}_pk_sync_${direction}_trigger` as const,
  }),

  // For foreign key (referencing tables)
  fk: (tableName: string, direction: SyncDirection) => ({
    trigger: `${tableName}_fk_sync_${direction}` as const,
    function: `${tableName}_fk_sync_${direction}_trigger` as const,
  }),
};

export const createConstraintName = {
  notNull: (tableName: string, type: ColumnType) =>
    `${shortenTableName(tableName)}_not_null_${type}` as const,
  notNullForColumn: (tableName: string, columnName: string) =>
    `${shortenTableName(tableName)}_not_null_${columnName}` as const,
  foreignKey: (tableName: string, columnName: string, type: ColumnType) =>
    `${shortenTableName(tableName)}_${columnName}_fkey_${type}` as const,
};

export const createSequenceName = (tableName: string) =>
  `${tableName}_id_seq` as const;

/**
 * Converts Postgres array string to JS array
 * Example: '{userId,groupId}' -> ['userId', 'groupId']
 */
function parsePostgresArray(arrayString: string): string[] {
  return arrayString
    .replace(/^\{|\}$/g, "")
    .split(",")
    .map((s) => s.trim());
}

// Errors.

class MigrationError extends Error {
  constructor(
    message: string,
    public step: string,
    public cause?: Error
  ) {
    super(message);
    this.name = "MigrationError";
  }
}

// Migration.

class IntToBigIntMigration {
  private pool: Pool;
  private config: Required<MigrationConfig>;

  constructor(connectionString: string, config: MigrationConfig) {
    this.pool = new Pool({ connectionString });
    this.config = {
      schemaName: "public",
      timeoutSeconds: 3600,
      ...config,
    };
  }

  async execute(step: MigrationStepType): Promise<void> {
    try {
      switch (step) {
        case "setup":
          await this.setup();
          break;

        case "backfill":
          await this.backfill();
          break;

        case "pre-cutover":
          await this.prepareCutover();
          break;

        case "cutover":
          await this.cutover();
          break;

        case "rollback":
          await this.rollback();
          break;

        case "cleanup":
          await this.cleanup();
          break;

        default:
          assertNever(step);
      }
    } catch (error) {
      throw new MigrationError(
        `Migration failed during ${step} on table ${this.config.tableName}`,
        step,
        error instanceof Error ? error : undefined
      );
    }
  }

  // Setup Phase

  private async setup(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Verify table we want to migrate exists
      const tableExists = await this.verifyTableExists(client);
      if (!tableExists) {
        throw new Error(`Table ${this.config.tableName} does not exist`);
      }

      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Add new columns
      await this.addNewColumns(client, referencingTables);

      // Setup triggers
      await this.setupTriggers(
        client,
        referencingTables,
        SYNC_DIRECTION.TO_BIGINT
      );
    } finally {
      client.release();
    }
  }

  // Backfill Phase

  private async backfill(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Backfill main table
      await this.backfillTable(client, {
        tableName: this.config.tableName,
        sourceColumn: MAIN_ID_COLUMN,
        targetColumn: createColumnName.new(MAIN_ID_COLUMN),
      });

      // Backfill referencing tables
      for (const ref of referencingTables) {
        await this.backfillTable(client, {
          tableName: ref.tableName,
          sourceColumn: ref.foreignKeyColumn,
          targetColumn: createColumnName.new(ref.foreignKeyColumn),
        });
      }

      // Show progress
      await this.showProgress(client, referencingTables);
    } finally {
      client.release();
    }
  }

  // Pre-cutover phase

  private async prepareCutover(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Verify backfill is complete
      const progress = await this.checkProgress(client, referencingTables);
      if (!this.isMigrationComplete(progress) && !this.config.dryRun) {
        throw new Error("Cannot prepare cutove - backfill is not complete");
      }

      // Create indexes and constraints now that data is ready
      console.log(
        chalk.yellow(`[Pre-Cutover] Creating indexes and constraints`)
      );

      // Create indexes concurrently
      await this.createIndexes(client, referencingTables);

      // Set NOT NULL constraints on the new columns
      for (const ref of referencingTables) {
        const isNotNull = await this.isColumnNotNull(client, {
          tableName: ref.tableName,
          columnName: ref.foreignKeyColumn,
        });

        if (isNotNull) {
          await this.setNotNullConstraint(client, {
            tableName: ref.tableName,
            columnName: createColumnName.new(ref.foreignKeyColumn),
          });
        }
      }

      console.log(
        chalk.green(
          `[Pre-Cutover] Successfully created all indexes and constraints`
        )
      );
    } finally {
      client.release();
    }
  }

  // Cutover Phase

  private async cutover(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Use one global transaction for all table switches.
      await this.executeSql(client, "BEGIN");

      // Switch referencing table first as we can't switch main table with active FK constraints.
      for (const ref of referencingTables) {
        await this.switchReferencingTable(client, ref, {
          currentColumn: ref.foreignKeyColumn,
          newColumn: createColumnName.new(ref.foreignKeyColumn),
          legacyColumn: createColumnName.legacy(ref.foreignKeyColumn),
          constraintName: ref.constraintName,
        });
      }

      // Switch main table.
      await this.switchMainTable(client, {
        currentColumn: MAIN_ID_COLUMN,
        newColumn: createColumnName.new(MAIN_ID_COLUMN),
        legacyColumn: createColumnName.legacy(MAIN_ID_COLUMN),
        sequenceName: createSequenceName(this.config.tableName),
        indexName: createIndexName.primary(
          this.config.tableName,
          COLUMN_TYPE.BIGINT
        ),
      });

      // Setup legacy sync triggers to sync id to the legacy columns.
      await this.setupTriggers(
        client,
        referencingTables,
        SYNC_DIRECTION.TO_LEGACY
      );

      await this.executeSql(client, "COMMIT");
      console.log(
        chalk.green(`[Switch] Successfully completed all table switches`)
      );
    } catch (error) {
      await this.executeSql(client, "ROLLBACK");
      throw new Error(
        `Failed to switch columns: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    } finally {
      client.release();
    }
  }

  // Rollback Phase

  private async rollback(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Use one global transaction for all table switches.
      await this.executeSql(client, "BEGIN");

      // Switch referencing table first as we can't switch main table with active FK constraints.
      for (const ref of referencingTables) {
        // Create former FK indexes before renaming.
        console.log(
          chalk.yellow(
            `[Indexes] Creating constraints for table: ${chalk.bold(ref.tableName)}`
          )
        );

        // Create foreign key constraint.
        await this.createForeignKeyConstraints(
          client,
          ref,
          SYNC_DIRECTION.TO_LEGACY
        );

        // Then rename.
        await this.switchReferencingTable(
          client,
          ref,
          {
            currentColumn: ref.foreignKeyColumn,
            newColumn: createColumnName.new(ref.foreignKeyColumn),
            legacyColumn: createColumnName.legacy(ref.foreignKeyColumn),
            constraintName: ref.constraintName,
          },
          { isRollback: true }
        );
      }

      // Switch main table.
      await this.switchMainTable(
        client,
        {
          currentColumn: MAIN_ID_COLUMN,
          newColumn: createColumnName.new(MAIN_ID_COLUMN),
          legacyColumn: createColumnName.legacy(MAIN_ID_COLUMN),
          sequenceName: createSequenceName(this.config.tableName),
          indexName: createIndexName.primary(
            this.config.tableName,
            // We are rolling back to int
            COLUMN_TYPE.INT
          ),
        },
        { isRollback: true }
      );

      // Setup sync triggers to sync id to the new columns.
      await this.setupTriggers(
        client,
        referencingTables,
        SYNC_DIRECTION.TO_BIGINT
      );

      await this.executeSql(client, "COMMIT");
      console.log(
        chalk.green(`[Switch] Successfully completed all table switches`)
      );
    } catch (error) {
      await this.executeSql(client, "ROLLBACK");
      throw new Error(
        `Failed to switch columns: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  // Clean up Phase

  // We can't use a transaction for cleanup as it does not support creating indexes concurrently.
  private async cleanup(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);

      // Drop Triggers for main table that was replicating to legacy columns
      await this.dropTriggers(
        client,
        {
          tableName: this.config.tableName,
          isPrimaryKey: true,
        },
        SYNC_DIRECTION.TO_LEGACY
      );

      // Drop the rollback index that was created
      const rollbackIndexName = createIndexName.primary(
        this.config.tableName,
        COLUMN_TYPE.INT
      );
      assertInProduction(
        rollbackIndexName.length < 63,
        `Index name too long: ${rollbackIndexName}`
      );

      await this.executeSql(
        client,
        `DROP INDEX IF EXISTS "${rollbackIndexName}"`
      );

      // Drop the legacy column (this also drops the indexes)
      const legacyColumn = createColumnName.legacy(MAIN_ID_COLUMN);
      await this.dropColumn(client, {
        tableName: this.config.tableName,
        columnName: legacyColumn,
      });

      // Recreate the indexes without the `_bigint` suffix
      await this.cleanupBigintIndexes(client, {
        columnName: MAIN_ID_COLUMN,
        tableName: this.config.tableName,
      });

      // Clean up the primary key constraint check.
      const constraintName = createConstraintName.notNull(
        this.config.tableName,
        COLUMN_TYPE.BIGINT
      );

      await this.executeSql(
        client,
        `
        ALTER TABLE ${this.config.tableName}
        DROP CONSTRAINT IF EXISTS "${constraintName}";
        `
      );

      for (const ref of referencingTables) {
        // Drop Triggers for referencing tables that was replicating to legacy columns
        await this.dropTriggers(
          client,
          {
            tableName: ref.tableName,
            isPrimaryKey: false,
          },
          SYNC_DIRECTION.TO_LEGACY
        );

        // Drop the legacy column (this also drops the indexes)
        const legacyColumn = createColumnName.legacy(ref.foreignKeyColumn);
        await this.dropColumn(client, {
          tableName: ref.tableName,
          columnName: legacyColumn,
        });

        // Recreate the indexes without the `_bigint` suffix
        await this.cleanupBigintIndexes(client, {
          columnName: ref.foreignKeyColumn,
          tableName: ref.tableName,
        });

        // Recreate the foreign key constraints without the `_bigint` suffix
        await this.cleanupForeignKeyConstraints(client, ref);
      }

      console.log(chalk.green("[Cleanup] Successfully cleaned up all tables"));
    } finally {
      client.release();
    }
  }

  // Helper methods

  private async verifyTableExists(client: PoolClient): Promise<boolean> {
    const { rows } = await this.executeSql<{ exists: boolean }>(
      client,
      `
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      )
    `,
      [this.config.schemaName, this.config.tableName]
    );

    return rows[0].exists;
  }

  private async findReferencingTables(
    client: PoolClient
  ): Promise<ReferencingTable[]> {
    const { rows } = await this.executeSql<ReferencingTable>(
      client,
      `
      SELECT DISTINCT
        tc.table_schema as schema,
        tc.table_name as "tableName",
        kcu.column_name as "foreignKeyColumn",
        tc.constraint_name as "constraintName",
        pc.confdeltype as "deleteAction",
        pc.confupdtype as "updateAction"
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      JOIN pg_constraint pc
        ON tc.constraint_name = pc.conname
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = $1
        AND ccu.column_name = 'id'
    `,
      [this.config.tableName]
    );

    console.log(
      chalk.magenta(
        `[Referencing Tables] Found ${rows.length} referencing tables for table ${this.config.tableName}`
      )
    );

    rows.forEach((row) =>
      console.log(
        chalk.dim(`- ${row.schema}.${row.tableName} (${row.foreignKeyColumn})`)
      )
    );

    return rows;
  }

  // Columns helpers.

  private async isColumnNotNull(
    client: PoolClient,
    {
      tableName,
      columnName,
    }: {
      tableName: string;
      columnName: string;
    }
  ): Promise<boolean> {
    const result = await this.executeSql<{ is_nullable: string }>(
      client,
      `
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = $1
      AND column_name = $2;
    `,
      [tableName, columnName]
    );

    return result.rows[0]?.is_nullable === "NO";
  }

  private async shouldUseCheckConstraint(
    client: PoolClient,
    tableName: string
  ): Promise<boolean> {
    // Get table size in bytes
    const result = await this.executeSql<{ size_bytes: string }>(
      client,
      `
      SELECT pg_table_size($1) as size_bytes
      FROM pg_stat_user_tables
      WHERE relname = $2
      `,
      [tableName, tableName]
    );

    const sizeBytes = parseInt(result.rows[0]?.size_bytes || "0", 10);
    const sizeGB = sizeBytes / (1024 * 1024 * 1024);

    console.log(
      chalk.yellow(
        `[Migration] Table ${chalk.bold(tableName)} size: ${chalk.bold(
          `${Math.round(sizeGB * 100) / 100}GB`
        )}`
      )
    );

    // >= 1GB: Use CHECK constraint only
    // < 1GB: Case by case
    const LARGE_TABLE_THRESHOLD_GB = 1;
    const useCheckConstraint = sizeGB >= LARGE_TABLE_THRESHOLD_GB;

    console.log(
      chalk.yellow(
        `[Migration] Using ${chalk.bold(
          useCheckConstraint ? "CHECK constraint" : "SET NOT NULL"
        )} approach for table ${chalk.bold(tableName)}`
      )
    );

    return useCheckConstraint;
  }

  private async setNotNullConstraint(
    client: PoolClient,
    {
      tableName,
      columnName,
    }: {
      tableName: string;
      columnName: string;
    }
  ): Promise<void> {
    try {
      // PostgreSQL does not leverage the CHECK CONSRAINT when altering the table to set NOT NULL.
      // Which involves a full table scan which creates an ACCESS EXCLUSIVE lock.
      // For tables bigger than 10GB we set a CHECK CONSTRAINT temporary.
      // We will clean up later during off hours.
      const useNotNullConstraint = await this.shouldUseCheckConstraint(
        client,
        tableName
      );
      if (useNotNullConstraint) {
        const constraintName = createConstraintName.notNullForColumn(
          tableName,
          columnName
        );

        console.log(
          chalk.yellow(
            `[Constraints] Adding NOT NULL constraint for ${chalk.bold(
              `${tableName}.${columnName}`
            )}`
          )
        );

        // Add the NOT NULL constraint without validation
        await this.executeSql(
          client,
          `
          ALTER TABLE ${tableName}
          ADD CONSTRAINT "${constraintName}"
          CHECK ("${columnName}" IS NOT NULL) NOT VALID;
          `
        );

        // Validate the constraint
        console.log(
          chalk.yellow(
            `[Constraints] Validating NOT NULL constraint for ${chalk.bold(
              `${tableName}.${columnName}`
            )}`
          )
        );

        await this.executeSql(
          client,
          `
          ALTER TABLE ${tableName}
          VALIDATE CONSTRAINT "${constraintName}";
          `
        );
      } else {
        // /!\ This performs a full table scan and locks the table.
        // ONLY PERFORM THIS ON SMALL TABLE.
        await this.executeSql(
          client,
          `
          ALTER TABLE ${tableName}
          ALTER COLUMN "${columnName}" SET NOT NULL;
          `
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `[ERROR] Failed to set NOT NULL constraint on ${tableName}.${columnName}`
        )
      );
      throw error;
    }
  }

  private async addNewColumns(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<void> {
    const newColumn = createColumnName.new(MAIN_ID_COLUMN);

    console.log(chalk.blue("[Columns] Adding new BigInt columns"));

    console.log(
      chalk.yellow(`- Main table (${chalk.bold(this.config.tableName)}):`)
    );

    // Add new ID BigInt column to main table
    await this.executeSql(
      client,
      `
      ALTER TABLE ${this.config.tableName}
      ADD COLUMN IF NOT EXISTS "${newColumn}" BIGINT
    `
    );

    console.log(chalk.dim(`✓ Added column "${newColumn}"`));

    console.log(
      chalk.yellow(
        `- Referencing tables (${chalk.bold(referencingTables.length)}):`
      )
    );

    // Add new columns to referencing tables
    for (const ref of referencingTables) {
      const newRefColumn = createColumnName.new(ref.foreignKeyColumn);

      await this.executeSql(
        client,
        // We need double quote to escape the camel case column name
        `
        ALTER TABLE ${ref.tableName}
        ADD COLUMN IF NOT EXISTS "${newRefColumn}" BIGINT
      `
      );

      console.log(chalk.dim(`✓ ${ref.tableName} Added "${newRefColumn}"`));
    }

    console.log(chalk.green(`[Columns] Successfully added all BigInt columns`));
  }

  private async dropColumn(
    client: PoolClient,
    { tableName, columnName }: { tableName: string; columnName: string }
  ): Promise<void> {
    await this.executeSql(
      client,
      `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS "${columnName}"`
    );
  }

  // Triggers helpers.

  private async setupTriggers(
    client: PoolClient,
    referencingTables: ReferencingTable[],
    direction: SyncDirection
  ): Promise<void> {
    // Create PK sync trigger for the main table
    await this.createPKSyncTrigger(client, this.config.tableName, direction);

    // Create FK sync triggers for the referencing tables
    for (const ref of referencingTables) {
      await this.createFKSyncTrigger(client, ref, direction);
    }
  }

  private async createPKSyncTrigger(
    client: PoolClient,
    tableName: string,
    direction: SyncDirection
  ): Promise<void> {
    const { trigger: triggerName, function: functionName } =
      createTriggerNames.pk(tableName, direction);

    const sourceCol = MAIN_ID_COLUMN;
    const targetCol =
      direction === SYNC_DIRECTION.TO_LEGACY
        ? createColumnName.legacy(sourceCol)
        : createColumnName.new(sourceCol);

    console.log(
      chalk.blue(
        `[Trigger] Creating ${chalk.bold(triggerName)} for ${chalk.bold(tableName)}`
      )
    );

    await this.executeSql(
      client,
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`
    );

    console.log(chalk.dim(`- Dropped existing trigger if present`));

    await this.executeSql(
      client,
      `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."${targetCol}" := NEW."${sourceCol}";
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `
    );

    console.log(chalk.dim(`- Created trigger function`));

    await this.executeSql(
      client,
      `
      CREATE TRIGGER ${triggerName}
        BEFORE INSERT OR UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE FUNCTION ${functionName}()
    `
    );

    console.log(
      chalk.green(
        `[Trigger] Completed ${chalk.bold(triggerName)} setup for ${chalk.bold(tableName)}`
      )
    );
  }

  private async createFKSyncTrigger(
    client: PoolClient,
    ref: ReferencingTable,
    direction: SyncDirection
  ): Promise<void> {
    const { trigger: triggerName, function: functionName } =
      createTriggerNames.fk(ref.tableName, direction);

    const sourceCol = ref.foreignKeyColumn;
    const targetCol =
      direction === SYNC_DIRECTION.TO_LEGACY
        ? createColumnName.legacy(ref.foreignKeyColumn)
        : createColumnName.new(ref.foreignKeyColumn);

    console.log(
      chalk.blue(
        `[Trigger] Creating ${chalk.bold(triggerName)} for ${chalk.bold(ref.tableName)}`
      )
    );

    await this.executeSql(
      client,
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${ref.tableName}`
    );

    console.log(chalk.dim(`- Dropped existing trigger if present`));

    await this.executeSql(
      client,
      `
      CREATE OR REPLACE FUNCTION ${functionName}()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."${targetCol}" := NEW."${sourceCol}";
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `
    );

    console.log(chalk.dim(`- Created trigger function`));

    await this.executeSql(
      client,
      `
      CREATE TRIGGER ${triggerName}
        BEFORE INSERT OR UPDATE ON ${ref.tableName}
        FOR EACH ROW
        EXECUTE FUNCTION ${functionName}()
    `
    );
    console.log(chalk.dim(`- Created trigger`));

    console.log(
      chalk.green(
        `[Trigger] Completed ${chalk.bold(triggerName)} setup for ${chalk.bold(ref.tableName)}`
      )
    );
  }

  private async backfillTable(
    client: PoolClient,
    {
      tableName,
      sourceColumn,
      targetColumn,
    }: { tableName: string; sourceColumn: string; targetColumn: string }
  ): Promise<void> {
    const { rows: min_id_rows } = await this.executeSql<{ min_id: number }>(
      client,
      `
        SELECT COALESCE(MIN(id), 0) AS min_id FROM ${tableName}
      `
    );

    let currentId = min_id_rows[0].min_id > 0 ? min_id_rows[0].min_id - 1 : 0;

    const { rows: max_id_rows } = await this.executeSql<{ max_id: number }>(
      client,
      `
        SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tableName}
      `
    );

    const maxId = max_id_rows[0].max_id;

    while (currentId <= maxId) {
      await this.executeSql(
        client,
        `
        UPDATE ${tableName}
        SET "${targetColumn}" = "${sourceColumn}"
        WHERE id > $1 AND id <= $2
          AND "${targetColumn}" IS NULL
      `,
        [currentId, currentId + this.config.batchSize]
      );

      currentId = currentId + this.config.batchSize;

      console.log(
        chalk.blue(
          `[Progress] ${chalk.bold(tableName)}: ${currentId}/${maxId} (${Math.round((currentId / maxId) * 100)}%) - batch: ${this.config.batchSize}`
        )
      );
    }
  }

  // Indexes helpers.

  private async findForeignKeyIndexes(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<
    Array<{
      tableName: string;
      columnName: string;
      indexName: string;
    }>
  > {
    if (referencingTables.length === 0) {
      return [];
    }

    // Build the list of (table_name, column_name) pairs for the WHERE clause
    const conditions = referencingTables
      .map((ref, i) => `($${i * 2 + 1}::text, $${i * 2 + 2}::text)`)
      .join(", ");

    const params = referencingTables.flatMap((ref) => [
      ref.tableName,
      ref.foreignKeyColumn,
    ]);

    const result = await this.executeSql<{
      tableName: string;
      columnName: string;
      indexName: string;
    }>(
      client,
      `
      SELECT DISTINCT
        t.relname AS "tableName",
        a.attname AS "columnName",
        i.relname AS "indexName"
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON ix.indexrelid = i.oid
      JOIN pg_attribute a ON t.oid = a.attrelid
      WHERE (t.relname, a.attname) IN (${conditions})
        AND array_position(ix.indkey, a.attnum) = 0  -- Only when it's the first column
        AND t.relkind = 'r'
        AND ix.indisprimary = false;
      `,
      params
    );

    return result.rows;
  }

  private async findCompositeIndexes(
    client: PoolClient,
    tableName: string,
    columnName: string
  ): Promise<CompositeIndex[]> {
    const { rows } = await this.executeSql<{
      index_name: string;
      column_names: string;
      is_unique: boolean;
      where_clause: string;
    }>(
      client,
      `
      SELECT
        i.relname as index_name,
        ix.indisunique as is_unique,
        array_agg(a.attname ORDER BY k.ordering) as column_names,
        pg_get_expr(ix.indpred, ix.indrelid) as where_clause
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON ix.indexrelid = i.oid
      JOIN pg_attribute a ON t.oid = a.attrelid
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordering)
        ON a.attnum = k.attnum
      WHERE t.relname = $1
        AND t.relkind = 'r'
        AND ix.indisprimary = false
      GROUP BY i.relname, ix.indisunique, ix.indpred, ix.indrelid
      HAVING
        array_length(array_agg(a.attname), 1) > 1
        AND EXISTS (
          SELECT 1
          FROM unnest(array_agg(a.attname)) as cols
          WHERE cols = $2
        )
      `,
      [tableName, columnName]
    );

    console.log(
      chalk.blue(
        `[Composite Indexes] Found ${chalk.bold(rows.length)} for ${tableName}:`
      )
    );
    rows.forEach((r) =>
      console.log(
        chalk.magenta(
          `  - ${chalk.bold(r.index_name)} (${r.column_names})${r.is_unique ? " UNIQUE" : ""}${r.where_clause ? ` WHERE ${r.where_clause}` : ""}`
        )
      )
    );

    return rows.map((row) => ({
      indexName: row.index_name,
      columns: parsePostgresArray(row.column_names),
      isUnique: row.is_unique,
      whereClause: row.where_clause,
    }));
  }

  private async createCompositeIndexes(
    client: PoolClient,
    {
      newColumn,
      oldColumn,
      tableName,
      transformIndexName,
    }: {
      newColumn: string;
      oldColumn: string;
      tableName: string;
      transformIndexName: (indexName: string) => string;
    }
  ): Promise<void> {
    const compositeIndexes = await this.findCompositeIndexes(
      client,
      tableName,
      oldColumn
    );

    for (const index of compositeIndexes) {
      const newIndexName = transformIndexName(index.indexName);

      // Replace old column with new column in the columns array
      const newColumns = index.columns.map((col) =>
        col === oldColumn ? `"${newColumn}"` : `"${col}"`
      );

      await this.executeSql(
        client,
        `
        CREATE ${index.isUnique ? "UNIQUE" : ""} INDEX CONCURRENTLY
        IF NOT EXISTS "${newIndexName}"
        ON ${tableName}(${newColumns.join(", ")})
        ${index.whereClause ? `WHERE ${index.whereClause}` : ""};
        `
      );

      await this.waitForIndex(client, newIndexName);
    }
  }

  private async cleanupBigintIndexes(
    client: PoolClient,
    { tableName, columnName }: { tableName: string; columnName: string }
  ): Promise<void> {
    console.log(chalk.yellow(`[Cleanup] Processing indexes for ${tableName}`));

    // Composite indexes.

    // Create clean indexes (without the _bigint suffix)
    await this.createCompositeIndexes(client, {
      tableName,
      oldColumn: columnName, // current bigint column
      newColumn: columnName, // same column (we're just removing suffix)
      transformIndexName: (indexName) => indexName.replace("_bigint", ""), // remove _bigint suffix
    });

    // Find and drop old _bigint indexes
    const allIndexes = await this.findCompositeIndexes(
      client,
      tableName,
      columnName
    );

    for (const index of allIndexes) {
      if (index.indexName.endsWith("_bigint")) {
        await this.executeSql(
          client,
          `DROP INDEX CONCURRENTLY IF EXISTS "${index.indexName}";`
        );

        console.log(
          chalk.green(`[Cleanup] Dropped index ${chalk.bold(index.indexName)}`)
        );
      }
    }
  }

  private async createIndexes(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<void> {
    console.log(
      chalk.yellow(
        `[Indexes] Creating for table: ${chalk.bold(this.config.tableName)}`
      )
    );

    const newMainColumn = createColumnName.new(MAIN_ID_COLUMN);

    // Create an index for the existing PK. In case we need to rollback.
    // If we need to rollback, we will need to use this index to create the PK constraint from.
    await this.createAndWaitForIndex(client, {
      tableName: this.config.tableName,
      columnName: MAIN_ID_COLUMN,
      columnType: COLUMN_TYPE.INT,
      indexName: createIndexName.primary(
        this.config.tableName,
        COLUMN_TYPE.INT
      ),
      isPrimary: true,
    });

    // Create PK index for the new column.
    await this.createAndWaitForIndex(client, {
      tableName: this.config.tableName,
      columnName: newMainColumn,
      columnType: COLUMN_TYPE.BIGINT,
      indexName: createIndexName.primary(
        this.config.tableName,
        COLUMN_TYPE.BIGINT
      ),
      isPrimary: true,
    });

    // Transform index name to add _bigint suffix
    const transformIndexName = (indexName: string) => `${indexName}_bigint`;

    // Create composite indexes for the main table
    await this.createCompositeIndexes(client, {
      tableName: this.config.tableName,
      oldColumn: MAIN_ID_COLUMN,
      newColumn: newMainColumn,
      transformIndexName,
    });

    // Find existing FK indexes for all referencing tables at once
    const fkIndexes = await this.findForeignKeyIndexes(
      client,
      referencingTables
    );

    // Create FK indexes and their composite indexes
    for (const ref of referencingTables) {
      console.log(
        chalk.yellow(
          `[Indexes] Creating for table: ${chalk.bold(ref.tableName)}`
        )
      );

      const newFKColumn = createColumnName.new(ref.foreignKeyColumn);

      // Check if this table/column has a dedicated FK index
      const hasFKIndex = fkIndexes.some(
        (idx) =>
          idx.tableName === ref.tableName &&
          idx.columnName === ref.foreignKeyColumn
      );

      // Only create FK index if one existed before
      if (hasFKIndex) {
        console.log(
          chalk.yellow(
            `[Indexes] Creating FK index for ${chalk.bold(ref.tableName)}`
          )
        );

        await this.createAndWaitForIndex(client, {
          tableName: ref.tableName,
          columnName: newFKColumn,
          columnType: COLUMN_TYPE.BIGINT,
          indexName: createIndexName.foreign(
            ref.tableName,
            ref.foreignKeyColumn,
            COLUMN_TYPE.BIGINT
          ),
          isPrimary: false,
        });
      }

      // Create foreign key constraint.
      await this.createForeignKeyConstraints(
        client,
        ref,
        SYNC_DIRECTION.TO_BIGINT
      );

      // Create composite indexes for this referencing table
      await this.createCompositeIndexes(client, {
        tableName: ref.tableName,
        oldColumn: ref.foreignKeyColumn,
        newColumn: newFKColumn,
        transformIndexName,
      });
    }
  }

  private async createAndWaitForIndex(
    client: PoolClient,
    {
      columnName,
      columnType,
      indexName,
      isPrimary,
      tableName,
    }: {
      columnName: string;
      columnType: ColumnType;
      indexName: string;
      isPrimary: boolean;
      tableName: string;
    }
  ): Promise<void> {
    assertInProduction(
      indexName.length < 63,
      `Index name too long: ${indexName}`
    );

    // Only primary key indexes are unique.
    await this.executeSql(
      client,
      `
      CREATE ${isPrimary ? "UNIQUE" : ""} INDEX CONCURRENTLY
      IF NOT EXISTS "${indexName}" ON ${tableName}("${columnName}");
    `
    );

    await this.waitForIndex(client, indexName);

    if (isPrimary) {
      const constraintName = createConstraintName.notNull(
        tableName,
        columnType
      );

      try {
        // We can't use `IF NOT EXISTS` for constraints, so we need to catch the error.
        await this.executeSql(
          client,
          `
        ALTER TABLE ${tableName}
        ADD CONSTRAINT "${constraintName}"
        CHECK ("${columnName}" IS NOT NULL) NOT VALID;
        `
        );
      } catch (error) {
        if (
          error instanceof Error &&
          !error.message.includes("already exists")
        ) {
          throw error;
        }
      }

      await this.executeSql(
        client,
        `
        ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${constraintName};
        `
      );
    }
  }

  private async waitForIndex(
    client: PoolClient,
    indexName: string
  ): Promise<void> {
    const startTime = Date.now();

    if (this.config.dryRun) {
      console.log(
        chalk.yellow(
          `[Index] Would wait for ${chalk.bold(indexName)} in dry-run mode`
        )
      );
      return;
    }

    console.log(
      chalk.blue(`[Index] Waiting for ${chalk.bold(indexName)} to be ready`)
    );

    while (true) {
      const { rows } = await this.executeSql<{
        indisready: boolean;
        indisvalid: boolean;
      }>(
        client,
        `
        SELECT indisready, indisvalid
        FROM pg_class c
        JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = $1
      `,
        [indexName]
      );

      if (!rows[0]) {
        console.log(
          chalk.dim(
            `[Index] Waiting for ${chalk.bold(indexName)} to appear (${Math.floor((Date.now() - startTime) / 1000)}s)`
          )
        );
        await new Promise((resolve) => setTimeout(resolve, 10000));
        continue;
      }

      const { indisready, indisvalid } = rows[0];
      if (indisvalid && !indisready) {
        console.log(
          chalk.red(`[Index] Creation failed for ${chalk.bold(indexName)}`)
        );
        throw new Error(`Index ${indexName} creation failed`);
      }
      if (indisready && indisvalid) {
        const duration = Math.floor((Date.now() - startTime) / 1000);
        console.log(
          chalk.green(
            `[Index] ${chalk.bold(indexName)} ready after ${duration}s`
          )
        );

        return;
      }

      if (Date.now() - startTime > this.config.timeoutSeconds * 1000) {
        console.log(
          chalk.red(
            `[Index] Timeout waiting for ${chalk.bold(indexName)} after ${this.config.timeoutSeconds}s`
          )
        );
        throw new Error(`Index ${indexName} creation timed out`);
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  private async cleanupForeignKeyConstraints(
    client: PoolClient,
    ref: ReferencingTable
  ) {
    // Foreign key index.
    const fkIndexName = createIndexName.foreign(
      ref.tableName,
      ref.foreignKeyColumn,
      COLUMN_TYPE.BIGINT
    );
    assertInProduction(
      fkIndexName.length < 63,
      `Index name too long: ${fkIndexName}`
    );

    const newFkIndexName = fkIndexName.replace("_bigint", "");

    // Find existing FK indexes for all referencing tables at once
    const fkIndexes = await this.findForeignKeyIndexes(client, [ref]);

    // Check if this table/column has a dedicated FK index
    const hasFKIndex = fkIndexes.some(
      (idx) =>
        idx.tableName === ref.tableName &&
        idx.columnName === ref.foreignKeyColumn
    );

    // Create new FK index without _bigint suffix
    if (hasFKIndex) {
      await this.createAndWaitForIndex(client, {
        tableName: ref.tableName,
        columnName: ref.foreignKeyColumn,
        columnType: COLUMN_TYPE.BIGINT,
        indexName: newFkIndexName,
        isPrimary: false,
      });

      // Drop old FK index with _bigint suffix
      await this.executeSql(
        client,
        `DROP INDEX CONCURRENTLY IF EXISTS "${fkIndexName}";`
      );
    }

    // For cleanup, we want to rename from _bigint to clean name
    const constraintName = createConstraintName.foreignKey(
      ref.tableName,
      ref.foreignKeyColumn,
      COLUMN_TYPE.BIGINT
    );

    const newConstraintName = constraintName.replace("_bigint", "");

    console.log(
      chalk.yellow(
        `[Cleanup] Creating clean FK constraint for ${chalk.bold(ref.tableName)}`
      )
    );

    // Create new FK without _bigint suffix
    try {
      await this.executeSql(
        client,
        `
        ALTER TABLE ${ref.tableName}
        ADD CONSTRAINT "${newConstraintName}"
        FOREIGN KEY ("${ref.foreignKeyColumn}")
        REFERENCES ${this.config.tableName}(${MAIN_ID_COLUMN})
        ON UPDATE ${ref.updateAction === "n" ? "SET NULL" : "RESTRICT"}
        ON DELETE ${ref.deleteAction === "n" ? "SET NULL" : "RESTRICT"}
        NOT VALID;
        `
      );
    } catch (error) {
      if (error instanceof Error && !error.message.includes("already exists")) {
        throw error;
      }
    }

    await this.executeSql(
      client,
      `ALTER TABLE ${ref.tableName} VALIDATE CONSTRAINT "${newConstraintName}";`
    );

    // Drop old FK
    await this.executeSql(
      client,
      `ALTER TABLE ${ref.tableName} DROP CONSTRAINT IF EXISTS "${constraintName}";`
    );

    console.log(
      chalk.green(
        `[Cleanup] Renamed FK constraint ${chalk.bold(constraintName)} to ${chalk.bold(newConstraintName)}`
      )
    );
    return;
  }

  private async createForeignKeyConstraints(
    client: PoolClient,
    ref: ReferencingTable,
    direction: SyncDirection
  ): Promise<void> {
    const isForward = direction === SYNC_DIRECTION.TO_BIGINT;

    const newConstraintName = createConstraintName.foreignKey(
      ref.tableName,
      ref.foreignKeyColumn,
      isForward ? COLUMN_TYPE.BIGINT : COLUMN_TYPE.INT
    );

    // For forward (TO_BIGINT): new column references new PK
    // For backward (TO_LEGACY): legacy column references legacy PK
    const sourceColumn = isForward
      ? createColumnName.new(ref.foreignKeyColumn)
      : createColumnName.legacy(ref.foreignKeyColumn);

    const targetColumn = isForward
      ? createColumnName.new(MAIN_ID_COLUMN)
      : createColumnName.legacy(MAIN_ID_COLUMN);

    console.log(
      chalk.yellow(
        `[Setup] Creating FK constraint for ${chalk.bold(ref.tableName)}."${sourceColumn}"`
      )
    );

    // Create the new FK constraint concurrently.
    // /!\ We restrict the update and delete actions to RESTRICT.
    // Even with rollback, we won't rollback to the previous constraint.
    try {
      await this.executeSql(
        client,
        `
          ALTER TABLE ${ref.tableName}
          ADD CONSTRAINT "${newConstraintName}"
          FOREIGN KEY ("${sourceColumn}")
          REFERENCES ${this.config.tableName}(${targetColumn})
          ON UPDATE ${ref.updateAction === "n" ? "SET NULL" : "RESTRICT"}
          ON DELETE ${ref.deleteAction === "n" ? "SET NULL" : "RESTRICT"}
          NOT VALID;
          `
      );
    } catch (error) {
      if (error instanceof Error && !error.message.includes("already exists")) {
        throw error;
      }
    }

    // Validate the constraint
    await this.executeSql(
      client,
      `
        ALTER TABLE ${ref.tableName}
        VALIDATE CONSTRAINT "${newConstraintName}";
        `
    );

    console.log(
      chalk.green(
        `[Setup] Created and validated FK constraint ${chalk.bold(newConstraintName)}`
      )
    );
  }

  // Swap columns

  private async dropTriggers(
    client: PoolClient,
    { tableName, isPrimaryKey }: { tableName: string; isPrimaryKey: boolean },
    direction: SyncDirection
  ): Promise<void> {
    const triggerInfo = isPrimaryKey
      ? createTriggerNames.pk(tableName, direction)
      : createTriggerNames.fk(tableName, direction);

    await this.executeSql(
      client,
      `
      DROP TRIGGER IF EXISTS ${triggerInfo.trigger} ON ${tableName};
      DROP FUNCTION IF EXISTS ${triggerInfo.function};
      `
    );
  }

  private async switchMainTable(
    client: PoolClient,
    config: MainTableSwitchConfig,
    { isRollback }: { isRollback: boolean } = { isRollback: false }
  ): Promise<void> {
    const { currentColumn, newColumn, legacyColumn, sequenceName, indexName } =
      config;

    console.log(
      chalk.yellow(
        `[Switch] Processing main table: ${chalk.bold(this.config.tableName)}`
      )
    );

    await this.executeSql(
      client,
      `LOCK TABLE ${this.config.tableName} IN EXCLUSIVE MODE`
    );

    if (isRollback) {
      // First remove the to_bigint triggers on the main table.
      await this.dropTriggers(
        client,
        {
          tableName: this.config.tableName,
          isPrimaryKey: true,
        },
        SYNC_DIRECTION.TO_LEGACY
      );

      await this.executeSql(
        client,
        `
        -- Drop current PK constraint
        ALTER TABLE ${this.config.tableName}
        DROP CONSTRAINT ${this.config.tableName}_pkey;

        -- Rename current column back to new
        ALTER TABLE ${this.config.tableName}
        RENAME COLUMN "${currentColumn}" TO "${newColumn}";

        -- Rename legacy column back to original
        ALTER TABLE ${this.config.tableName}
        RENAME COLUMN "${legacyColumn}" TO "${currentColumn}";

        -- Add back original PK using the int index
        ALTER TABLE ${this.config.tableName}
        ADD CONSTRAINT "${this.config.tableName}_pkey"
        PRIMARY KEY USING INDEX "${indexName}";

        -- Convert sequence back to integer
        ALTER SEQUENCE ${sequenceName} AS integer;

        -- Set sequence ownership back to original column
        ALTER SEQUENCE ${sequenceName}
        OWNED BY ${this.config.tableName}."${currentColumn}";

        -- Remove default from new column
        ALTER TABLE "${this.config.tableName}"
        ALTER COLUMN "${newColumn}"
        DROP DEFAULT;

        -- Set default on column
        ALTER TABLE "${this.config.tableName}"
        ALTER COLUMN "${currentColumn}"
        SET DEFAULT nextval('"${sequenceName}"'::regclass);
        `
      );
    } else {
      // First remove the to_bigint triggers on the main table.
      await this.dropTriggers(
        client,
        {
          tableName: this.config.tableName,
          isPrimaryKey: true,
        },
        SYNC_DIRECTION.TO_BIGINT
      );

      await this.executeSql(
        client,
        `
          -- First convert sequence to bigint (can be done before any column changes)
          ALTER SEQUENCE ${sequenceName} AS bigint;

          -- Drop current PK constraint
          ALTER TABLE ${this.config.tableName}
          DROP CONSTRAINT ${this.config.tableName}_pkey;

          -- Rename old column to legacy
          ALTER TABLE ${this.config.tableName}
          RENAME COLUMN ${currentColumn} TO "${legacyColumn}";

          -- Rename new column to final name
          ALTER TABLE ${this.config.tableName}
          RENAME COLUMN "${newColumn}" TO "${currentColumn}";

          -- Add new PK using the prepared unique index
          ALTER TABLE ${this.config.tableName}
          ADD CONSTRAINT "${this.config.tableName}_pkey"
          PRIMARY KEY USING INDEX "${indexName}";

          -- Set sequence ownership
          ALTER SEQUENCE ${sequenceName}
          OWNED BY ${this.config.tableName}."${currentColumn}";

          -- Remove default from legacy column
          ALTER TABLE "${this.config.tableName}"
          ALTER COLUMN "${legacyColumn}"
          DROP DEFAULT;

          -- Set default on column
          ALTER TABLE "${this.config.tableName}"
          ALTER COLUMN "${currentColumn}"
          SET DEFAULT nextval('"${sequenceName}"'::regclass);
          `
      );
    }

    console.log(chalk.green(`[Switch] Main table processed successfully`));
  }

  private async switchReferencingTable(
    client: PoolClient,
    ref: ReferencingTable,
    config: ReferencingColumnSwitchConfig,
    { isRollback }: { isRollback: boolean } = { isRollback: false }
  ): Promise<void> {
    const { currentColumn, newColumn, legacyColumn, constraintName } = config;

    console.log(
      chalk.yellow(
        `[Switch] Processing referencing table: ${chalk.bold(ref.tableName)}`
      )
    );

    await this.executeSql(
      client,
      `LOCK TABLE ${ref.tableName} IN EXCLUSIVE MODE`
    );

    if (isRollback) {
      // First remove the to_bigint triggers on the referencing table.
      await this.dropTriggers(
        client,
        {
          tableName: ref.tableName,
          isPrimaryKey: false,
        },
        SYNC_DIRECTION.TO_LEGACY
      );

      await this.executeSql(
        client,
        `
        -- Drop new FK constraint (this has to happen before we can drop the PK constraint)
        ALTER TABLE ${ref.tableName}
        DROP CONSTRAINT "${constraintName}";

        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${currentColumn}" TO "${newColumn}";

        -- Rename old column to original name
        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${legacyColumn}" TO "${currentColumn}";
        `
      );
    } else {
      // First remove the to_bigint triggers on the referencing table.
      await this.dropTriggers(
        client,
        {
          tableName: ref.tableName,
          isPrimaryKey: false,
        },
        SYNC_DIRECTION.TO_BIGINT
      );

      await this.executeSql(
        client,
        `
        -- Drop old FK constraint (this has to happen before we can drop the PK constraint)
        ALTER TABLE ${ref.tableName}
        DROP CONSTRAINT "${constraintName}";

        -- Rename old column to legacy
        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${currentColumn}" TO "${legacyColumn}";

        -- Rename new column to final name
        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${newColumn}" TO "${currentColumn}";
        `
      );
    }
  }

  private async checkProgress(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<MigrationProgress[]> {
    const progress: MigrationProgress[] = [];

    // Check main table
    const mainProgress = await this.checkTableProgress(client, {
      tableName: this.config.tableName,
      sourceColumn: MAIN_ID_COLUMN,
      targetColumn: createColumnName.new(MAIN_ID_COLUMN),
    });
    progress.push(mainProgress);

    // Check referencing tables
    for (const ref of referencingTables) {
      const refProgress = await this.checkTableProgress(client, {
        tableName: ref.tableName,
        sourceColumn: ref.foreignKeyColumn,
        targetColumn: createColumnName.new(ref.foreignKeyColumn),
      });
      progress.push(refProgress);
    }

    return progress;
  }

  private async checkTableProgress(
    client: PoolClient,
    {
      tableName,
      sourceColumn,
      targetColumn,
    }: { tableName: string; sourceColumn: string; targetColumn: string }
  ): Promise<MigrationProgress> {
    const { rows } = await this.executeSql<{
      source_count: number;
      target_count: number;
      progress_percentage: string;
    }>(
      client,
      `
      SELECT
        COUNT("${sourceColumn}")::bigint as source_count,
        COUNT("${targetColumn}")::bigint as target_count,
        CASE
          WHEN COUNT("${sourceColumn}") = 0 THEN 100
          ELSE ROUND(
            (COUNT("${targetColumn}")::numeric /
            NULLIF(COUNT("${sourceColumn}")::numeric, 0)
            * 100
            ), 2
          )
        END as progress_percentage
      FROM ${tableName}
    `
    );

    const { source_count, target_count, progress_percentage } = rows[0];

    console.log(chalk.dim(`[Progress Details] ${tableName}:`));
    console.log(chalk.dim(`- Non-NULL in ${sourceColumn}: ${source_count}`));
    console.log(chalk.dim(`- Non-NULL in ${targetColumn}: ${target_count}`));

    return {
      tableName,
      totalRows: source_count,
      migratedRows: target_count,
      progressPercentage: progress_percentage
        ? parseInt(progress_percentage, 10)
        : 100,
    };
  }

  private isMigrationComplete(progress: MigrationProgress[]): boolean {
    return progress.every((p) => p.progressPercentage === 100);
  }

  private async showProgress(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<void> {
    const progress = await this.checkProgress(client, referencingTables);

    console.log(chalk.blue("\n[Migration Progress]"));
    for (const p of progress) {
      const status =
        p.progressPercentage === 100 ? chalk.green("✓") : chalk.yellow("~");

      console.log(
        `  ${status} ${chalk.bold(p.tableName.padEnd(20))} ${p.migratedRows}/${p.totalRows} rows (${chalk.bold(p.progressPercentage)}%)`
      );
    }
  }

  private async executeSql<T>(
    client: PoolClient,
    sql: string,
    params?: any[]
  ): Promise<{ rows: T[] }> {
    if (this.config.dryRun) {
      let formattedSql = sql;
      if (params) {
        params.forEach((param, index) => {
          const placeholder = `$${index + 1}`;
          formattedSql = formattedSql.replace(placeholder, param);
        });
      }

      console.info("[DRY RUN] Would execute:");
      console.info(formattedSql);

      // Even in dry run, we run SELECT queries to get results.
      if (sql.trim().toLowerCase().startsWith("select")) {
        const { rows } = await client.query(sql, params);
        return { rows } as { rows: T[] };
      }

      return { rows: [] } as { rows: T[] };
    }

    const { rows } = await client.query(sql, params);
    return { rows } as { rows: T[] };
  }
}

async function getAllTables(connectionString: string): Promise<string[]> {
  const pool = new Pool({ connectionString });

  const client = await pool.connect();
  try {
    const { rows } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    `);

    return rows.map((r) => r.table_name);
  } finally {
    client.release();
  }
}

makeScript(
  {
    database: {
      type: "string",
      describe: "Database connection string",
      demandOption: true,
      alias: "d",
    },
    table: {
      type: "string",
      describe: "Table to migrate",
      demandOption: true,
      alias: "t",
    },
    step: {
      type: "string",
      describe: `Migration step (${MigrationSteps.join("|")})`,
      demandOption: true,
      alias: "s",
      choices: MigrationSteps,
    },
    batchSize: {
      type: "number",
      describe: "Batch size for backfill",
      default: 10000,
      alias: "b",
    },
    schema: {
      type: "string",
      describe: "Schema name",
      default: "public",
    },
    timeout: {
      type: "number",
      describe: "Timeout in seconds",
      default: 3600,
    },
  },
  async ({ database, table, step, batchSize, schema, timeout, execute }) => {
    if (table === "all") {
      assert(
        process.env.NODE_ENV === "development",
        "Only allowed in development"
      );

      console.log(
        chalk.red("About to run migration on all tables in development")
      );

      const tables = await getAllTables(database);
      console.log(chalk.yellow(`Found ${tables.length} tables`));
      tables.forEach((t) => console.log(chalk.yellow(`- ${t}`)));

      for (const t of tables) {
        console.log(
          chalk.blue(`\n[Migration] Starting migration for table: ${t}`)
        );

        const migration = new IntToBigIntMigration(database, {
          tableName: t,
          schemaName: schema,
          batchSize,
          timeoutSeconds: timeout,
          dryRun: !execute,
        });

        // Run all steps for this table
        for (const step of MigrationSteps) {
          if (step === "rollback") {
            // Skip rollback for all tables
            continue;
          }

          console.log(chalk.blue(`\n[${t}] Executing step: ${step}`));

          try {
            await migration.execute(step);
          } catch (error) {
            console.error(
              chalk.red(`Failed during ${step} for table ${t}:`),
              error
            );
            throw error; // Stop the entire migration if any step fails
          }
        }

        console.log(
          chalk.green(`\n[Migration] Completed migration for table: ${t}`)
        );
      }
    } else {
      const migration = new IntToBigIntMigration(database, {
        tableName: table,
        schemaName: schema,
        batchSize,
        timeoutSeconds: timeout,
        dryRun: !execute,
      });

      await migration.execute(step as MigrationStepType);
    }
  }
);
