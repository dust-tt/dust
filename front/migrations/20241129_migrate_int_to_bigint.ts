import type { PoolClient } from "pg";
import { Pool } from "pg";

import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";
import chalk from "chalk";

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
}

interface ReferencingTable {
  schema: string;
  tableName: string;
  foreignKeyColumn: string;
  constraintName: string;
}

interface MigrationProgress {
  tableName: string;
  totalRows: number;
  migratedRows: number;
  progressPercentage: number;
}

interface MainTableSwitchConfig {
  currentColumn: string; // e.g., 'id'
  newColumn: string; // e.g., 'new_id'
  legacyColumn: string; // e.g., 'id_legacy'
  sequenceName: string; // e.g., 'table_id_seq'
  indexName: string; // e.g., 'table_pkey_bigint'
  triggerName: string; // e.g., 'bigint_sync'
  triggerFunction: string; // e.g., 'table_bigint_sync_trigger'
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
] as const;
type MigrationStepType = (typeof MigrationSteps)[number];

const MAIN_TABLE_NEW_COLUMN = "new_id";
const MAIN_TABLE_LEGACY_COLUMN = "id_legacy";

const makeNewForeignKeyColumn = (column: string) => `${column}_new`;

const makeNewIndexName = (
  indexName: string,
  { isPrimary }: { isPrimary: boolean }
) => `${indexName}_${isPrimary ? "pkey" : "fk"}_bigint`;

const makeTriggerName = ({ isLegacy }: { isLegacy: boolean }) =>
  isLegacy ? "legacy_sync" : "bigint_sync";

const makeTriggerFunctionName = (
  tableName: string,
  { isLegacy }: { isLegacy: boolean }
) => `${tableName}_${isLegacy ? "legacy_sync_trigger" : "bigint_sync_trigger"}`;

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

        default:
          throw new Error(`Unknown step: ${step}`);
      }
    } catch (error) {
      throw new MigrationError(
        `Migration failed during ${step}`,
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
      console.log(`Found ${referencingTables.length} referencing tables`);

      // Add new columns
      await this.addNewColumns(client, referencingTables);

      // Setup triggers
      await this.setupTriggers(client, referencingTables);
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
      console.log(`Found ${referencingTables.length} referencing tables`);

      // Backfill main table
      await this.backfillTable(
        client,
        this.config.tableName,
        "id",
        MAIN_TABLE_NEW_COLUMN
      );

      // Backfill referencing tables
      for (const ref of referencingTables) {
        await this.backfillTable(
          client,
          ref.tableName,
          ref.foreignKeyColumn,
          makeNewForeignKeyColumn(ref.foreignKeyColumn)
        );
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
      console.log(`Found ${referencingTables.length} referencing tables`);

      // Verify backfill is complete
      const progress = await this.checkProgress(client, referencingTables);
      if (!this.isMigrationComplete(progress) && !this.config.dryRun) {
        throw new Error("Cannot prepare cutove - backfill is not complete");
      }

      // Create indexes and constraints now that data is ready
      console.log(
        chalk.yellow(`[Pre-Cutover] Creating indexes and constraints`)
      );

      // Create indexes concurrently.
      await this.createIndexes(client, referencingTables);

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
      console.log(`Found ${referencingTables.length} referencing tables`);

      // Use one global transaction for all table switches.
      await this.executeSql(client, "BEGIN");

      // Switch referencing table first as we can't switch main table with active FK constraints.
      for (const ref of referencingTables) {
        await this.switchReferencingTable(client, ref, {
          currentColumn: ref.foreignKeyColumn,
          newColumn: makeNewForeignKeyColumn(ref.foreignKeyColumn),
          legacyColumn: `${ref.foreignKeyColumn}_legacy`,
          constraintName: ref.constraintName,
        });
      }

      // Switch main table.
      await this.switchMainTable(client, {
        currentColumn: "id",
        newColumn: MAIN_TABLE_NEW_COLUMN,
        legacyColumn: MAIN_TABLE_LEGACY_COLUMN,
        sequenceName: `${this.config.tableName}_id_seq`,
        indexName: makeNewIndexName(this.config.tableName, { isPrimary: true }),
        triggerName: makeTriggerName({ isLegacy: false }),
        triggerFunction: makeTriggerFunctionName(this.config.tableName, {
          isLegacy: false,
        }),
      });

      // Setup legacy sync triggers for the main table and referencing tables.
      await this.setupTriggers(client, referencingTables, { isLegacy: true });

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

  // Rollback Phase

  private async rollback(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Find referencing tables
      const referencingTables = await this.findReferencingTables(client);
      console.log(`Found ${referencingTables.length} referencing tables`);

      // Use one global transaction for all table switches.
      await this.executeSql(client, "BEGIN");

      // Switch referencing table first as we can't switch main table with active FK constraints.
      for (const ref of referencingTables) {
        console.log(">> currentColon", ref.foreignKeyColumn);
        console.log(">> constraintName", ref.constraintName);

        await this.switchReferencingTable(
          client,
          ref,
          {
            currentColumn: ref.foreignKeyColumn,
            newColumn: `${ref.foreignKeyColumn}_temp`,
            legacyColumn: `${ref.foreignKeyColumn}_legacy`,
            constraintName: ref.constraintName,
          },
          { isRollback: true }
        );
      }

      // Switch main table.
      await this.switchMainTable(
        client,
        {
          currentColumn: "id",
          newColumn: MAIN_TABLE_NEW_COLUMN,
          legacyColumn: MAIN_TABLE_LEGACY_COLUMN,
          sequenceName: `${this.config.tableName}_id_seq`,
          indexName: makeNewIndexName(this.config.tableName, {
            isPrimary: true,
          }),
          triggerName: makeTriggerName({ isLegacy: false }),
          triggerFunction: makeTriggerFunctionName(this.config.tableName, {
            isLegacy: false,
          }),
        },
        { isRollback: true }
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
        tc.constraint_name as "constraintName"
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = $1
        AND ccu.column_name = 'id'
    `,
      [this.config.tableName]
    );

    return rows;
  }

  private async addNewColumns(
    client: PoolClient,
    referencingTables: ReferencingTable[]
  ): Promise<void> {
    // Add MAIN_TABLE_NEW_COLUMN column to main table
    await this.executeSql(
      client,
      `
      ALTER TABLE ${this.config.tableName}
      ADD COLUMN IF NOT EXISTS "${MAIN_TABLE_NEW_COLUMN}" BIGINT
    `
    );
    console.log(
      `Added ${MAIN_TABLE_NEW_COLUMN} column to ${this.config.tableName}`
    );

    // Add new columns to referencing tables
    for (const ref of referencingTables) {
      await this.executeSql(
        client,
        // We need double quote to escape the camel case column name
        `
        ALTER TABLE ${ref.tableName}
        ADD COLUMN IF NOT EXISTS "${makeNewForeignKeyColumn(ref.foreignKeyColumn)}" BIGINT
      `
      );
      console.log(
        `Added ${makeNewForeignKeyColumn(ref.foreignKeyColumn)} column to ${ref.tableName}`
      );
    }
  }

  private async setupTriggers(
    client: PoolClient,
    referencingTables: ReferencingTable[],
    opts: { isLegacy?: boolean } = {}
  ): Promise<void> {
    await this.createPKSyncTrigger(client, this.config.tableName, opts);
    for (const ref of referencingTables) {
      await this.createFKSyncTrigger(client, ref, opts);
    }
  }

  private async createPKSyncTrigger(
    client: PoolClient,
    tableName: string,
    { isLegacy = false }: { isLegacy?: boolean } = {}
  ): Promise<void> {
    const triggerName = makeTriggerName({ isLegacy });
    const sourceCol = "id";
    const targetCol = isLegacy
      ? MAIN_TABLE_LEGACY_COLUMN
      : MAIN_TABLE_NEW_COLUMN;

    await this.executeSql(
      client,
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName}`
    );

    await this.executeSql(
      client,
      `
      CREATE OR REPLACE FUNCTION ${tableName}_${triggerName}_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.${targetCol} := NEW.${sourceCol};
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `
    );

    await this.executeSql(
      client,
      `
      CREATE TRIGGER ${triggerName}
        BEFORE INSERT OR UPDATE ON ${tableName}
        FOR EACH ROW
        EXECUTE FUNCTION ${tableName}_${triggerName}_trigger()
    `
    );

    console.log(`Created ${triggerName} trigger on ${tableName}`);
  }

  private async createFKSyncTrigger(
    client: PoolClient,
    ref: ReferencingTable,
    { isLegacy = false }: { isLegacy?: boolean } = {}
  ): Promise<void> {
    const triggerName = isLegacy ? "legacy_fk_sync" : "fk_sync";
    const sourceCol = ref.foreignKeyColumn;
    const targetCol = isLegacy
      ? `${ref.foreignKeyColumn}_legacy`
      : makeNewForeignKeyColumn(ref.foreignKeyColumn);

    console.log(
      chalk.blue(
        `[Trigger] Creating ${chalk.bold(triggerName)} for ${chalk.bold(ref.tableName)}`
      )
    );

    await this.executeSql(
      client,
      `DROP TRIGGER IF EXISTS ${triggerName} ON ${ref.tableName}`
    );

    console.log(chalk.dim(`• Dropped existing trigger if present`));

    await this.executeSql(
      client,
      `
      CREATE OR REPLACE FUNCTION ${ref.tableName}_${triggerName}_trigger()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW."${targetCol}" := NEW."${sourceCol}";
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `
    );

    console.log(chalk.dim(`• Created trigger function`));

    await this.executeSql(
      client,
      `
      CREATE TRIGGER ${triggerName}
        BEFORE INSERT OR UPDATE ON ${ref.tableName}
        FOR EACH ROW
        EXECUTE FUNCTION ${ref.tableName}_${triggerName}_trigger()
    `
    );
    console.log(chalk.dim(`• Created trigger`));

    console.log(
      chalk.green(
        `[Trigger] Completed ${chalk.bold(triggerName)} setup for ${chalk.bold(ref.tableName)}`
      )
    );
  }

  private async backfillTable(
    client: PoolClient,
    tableName: string,
    sourceColumn: string,
    targetColumn: string
  ): Promise<void> {
    let currentId = 0;

    const { rows } = await this.executeSql<{ max_id: number }>(
      client,
      `
        SELECT COALESCE(MAX(id), 0) AS max_id FROM ${tableName}
      `
    );

    const maxId = rows[0].max_id;

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

  private async findCompositeIndexes(
    client: PoolClient,
    tableName: string,
    columnName: string
  ): Promise<CompositeIndex[]> {
    const { rows } = await this.executeSql<{
      index_name: string;
      column_names: string;
      is_unique: boolean;
    }>(
      client,
      `
      SELECT
        i.relname as index_name,
        ix.indisunique as is_unique,
        array_agg(a.attname ORDER BY k.ordering) as column_names
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON ix.indexrelid = i.oid
      JOIN pg_attribute a ON t.oid = a.attrelid
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ordering)
        ON a.attnum = k.attnum
      WHERE t.relname = $1
        AND t.relkind = 'r'
        AND ix.indisprimary = false
      GROUP BY i.relname, ix.indisunique
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
      chalk.blue(`[Composite Indexes] Found ${chalk.bold(rows.length)}:`)
    );
    rows.forEach((r) =>
      console.log(
        chalk.magenta(
          `  • ${chalk.bold(r.index_name)} (${r.column_names})${r.is_unique ? " UNIQUE" : ""}`
        )
      )
    );

    return rows.map((row) => ({
      indexName: row.index_name,
      columns: parsePostgresArray(row.column_names),
      isUnique: row.is_unique,
    }));
  }

  private async createCompositeIndexes(
    client: PoolClient,
    tableName: string,
    oldColumn: string,
    newColumn: string
  ): Promise<void> {
    const compositeIndexes = await this.findCompositeIndexes(
      client,
      tableName,
      oldColumn
    );

    for (const index of compositeIndexes) {
      // Create new index name
      const newIndexName = `${index.indexName}_bigint`;

      // Replace old column with new column in the columns array
      const newColumns = index.columns.map((col) =>
        col === oldColumn ? newColumn : `"${col}"`
      );

      await this.executeSql(
        client,
        `
        CREATE ${index.isUnique ? "UNIQUE" : ""} INDEX CONCURRENTLY
        IF NOT EXISTS "${newIndexName}"
        ON ${tableName}(${newColumns.join(", ")});
        `
      );

      await this.waitForIndex(client, newIndexName);
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

    // Create PK index
    await this.createAndWaitForIndex(
      client,
      this.config.tableName,
      MAIN_TABLE_NEW_COLUMN,
      makeNewIndexName(this.config.tableName, { isPrimary: true }),
      { isPrimary: true }
    );

    // Create composite indexes for the main table
    await this.createCompositeIndexes(
      client,
      this.config.tableName,
      "id", // Original column
      MAIN_TABLE_NEW_COLUMN
    );

    // Create FK indexes and their composite indexes
    for (const ref of referencingTables) {
      console.log(
        chalk.yellow(
          `[Indexes] Creating for table: ${chalk.bold(ref.tableName)}`
        )
      );

      const newFKColumn = makeNewForeignKeyColumn(ref.foreignKeyColumn);

      // Create the basic FK index
      await this.createAndWaitForIndex(
        client,
        ref.tableName,
        newFKColumn,
        makeNewIndexName(`${ref.tableName}_${ref.foreignKeyColumn}`, {
          isPrimary: false,
        }),
        { isPrimary: false }
      );

      // Create foreign key constraint.
      await this.createForeignKeyConstraints(client, ref);

      // Create composite indexes for this referencing table
      await this.createCompositeIndexes(
        client,
        ref.tableName,
        ref.foreignKeyColumn,
        newFKColumn
      );
    }
  }

  private async createAndWaitForIndex(
    client: PoolClient,
    tableName: string,
    columnName: string,
    indexName: string,
    { isPrimary }: { isPrimary: boolean }
  ): Promise<void> {
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
      const contraintName = `${tableName}_not_null_bigint`;

      try {
        // We can't use `IF NOT EXISTS` for constraints with CHECL, so we need to catch the error.
        await this.executeSql(
          client,
          `
        ALTER TABLE ${tableName}
        ADD CONSTRAINT ${contraintName}
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
        ALTER TABLE ${tableName} VALIDATE CONSTRAINT ${contraintName};
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

  private async createForeignKeyConstraints(
    client: PoolClient,
    ref: ReferencingTable
  ): Promise<void> {
    const newConstraintName = `${ref.constraintName}_bigint`;
    const newColumn = makeNewForeignKeyColumn(ref.foreignKeyColumn);

    console.log(
      chalk.yellow(
        `[Setup] Creating FK constraint for ${chalk.bold(ref.tableName)}."${newColumn}"`
      )
    );

    // Create the new FK constraint concurrently.
    // /!\ We restrict the update and delete actions to RESTRICT.
    try {
      await this.executeSql(
        client,
        `
          ALTER TABLE ${ref.tableName}
          ADD CONSTRAINT ${newConstraintName}
          FOREIGN KEY ("${newColumn}")
          REFERENCES ${this.config.tableName}(${MAIN_TABLE_NEW_COLUMN})
          ON UPDATE RESTRICT
          ON DELETE RESTRICT
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
        VALIDATE CONSTRAINT ${newConstraintName};
        `
    );

    console.log(
      chalk.green(
        `[Setup] Created and validated FK constraint ${chalk.bold(newConstraintName)}`
      )
    );
  }

  // Swap columns

  private async switchMainTable(
    client: PoolClient,
    config: MainTableSwitchConfig,
    { isRollback }: { isRollback: boolean } = { isRollback: false }
  ): Promise<void> {
    const {
      currentColumn,
      newColumn,
      legacyColumn,
      sequenceName,
      indexName,
      triggerName,
      triggerFunction,
    } = config;

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
      await this.executeSql(
        client,
        `
          -- Convert sequence back to integer
          ALTER SEQUENCE ${sequenceName} AS integer;

          -- Drop current PK constraint
          ALTER TABLE ${this.config.tableName}
          DROP CONSTRAINT ${this.config.tableName}_pkey;

          -- Rename current column to temp
          ALTER TABLE ${this.config.tableName}
          RENAME COLUMN "${currentColumn}" TO "${currentColumn}_temp";

          -- Restore from legacy
          ALTER TABLE ${this.config.tableName}
          RENAME COLUMN "${legacyColumn}" TO "${currentColumn}";

          -- Add back original PK
          ALTER TABLE ${this.config.tableName}
          ADD CONSTRAINT ${this.config.tableName}_pkey
          PRIMARY KEY (${currentColumn});

          -- Set sequence ownership back to original column
          ALTER SEQUENCE ${sequenceName}
          OWNED BY ${this.config.tableName}."${currentColumn}";

          -- Clean up temp column
          ALTER TABLE ${this.config.tableName}
          DROP COLUMN ${currentColumn}_temp;

          DROP TRIGGER IF EXISTS ${triggerName} ON ${this.config.tableName};
          DROP FUNCTION IF EXISTS ${triggerFunction}();
        `
      );
    } else {
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
          ADD CONSTRAINT ${this.config.tableName}_pkey
          PRIMARY KEY USING INDEX ${indexName};

          -- Set sequence ownership (this also sets the default and removes old defaults)
          ALTER SEQUENCE ${sequenceName}
          OWNED BY ${this.config.tableName}."${currentColumn}";

          -- Drop old trigger and function
          DROP TRIGGER IF EXISTS ${triggerName} ON ${this.config.tableName};
          DROP FUNCTION IF EXISTS ${triggerFunction}();
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
      await this.executeSql(
        client,
        `
          -- Drop current FK constraint (bigint version)
          ALTER TABLE ${ref.tableName}
          DROP CONSTRAINT "${constraintName}";

          -- Rename current bigint column to temp
          ALTER TABLE ${ref.tableName}
          RENAME COLUMN "${currentColumn}" TO "${newColumn}";

          -- Restore original column from legacy
          ALTER TABLE ${ref.tableName}
          RENAME COLUMN "${legacyColumn}" TO "${currentColumn}";

          -- Add back original FK constraint
          ALTER TABLE ${ref.tableName}
          ADD CONSTRAINT "${constraintName.replace("_bigint", "")}"
          FOREIGN KEY ("${currentColumn}")
          REFERENCES ${this.config.tableName}("${MAIN_TABLE_LEGACY_COLUMN}");

          -- Clean up the bigint column
          ALTER TABLE ${ref.tableName}
          DROP COLUMN "${newColumn}";

           -- Drop legacy sync trigger and function
          DROP TRIGGER IF EXISTS ${makeTriggerName({ isLegacy: true })} ON ${ref.tableName};
          DROP FUNCTION IF EXISTS ${makeTriggerFunctionName(ref.tableName, { isLegacy: true })};
        `
      );
    } else {
      await this.executeSql(
        client,
        `
        -- Drop old FK constraint (this has to happen before we can rename)
        ALTER TABLE ${ref.tableName}
        DROP CONSTRAINT "${constraintName}";

        -- Rename old column to legacy
        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${currentColumn}" TO "${legacyColumn}";

        -- Rename new column to final name
        ALTER TABLE ${ref.tableName}
        RENAME COLUMN "${newColumn}" TO "${currentColumn}";

        -- Drop old trigger and function
        DROP TRIGGER IF EXISTS fk_sync ON ${ref.tableName};
        DROP FUNCTION IF EXISTS ${ref.tableName}_fk_sync_trigger();
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
    const mainProgress = await this.checkTableProgress(
      client,
      this.config.tableName,
      MAIN_TABLE_NEW_COLUMN
    );
    progress.push(mainProgress);

    // Check referencing tables
    for (const ref of referencingTables) {
      const refProgress = await this.checkTableProgress(
        client,
        ref.tableName,
        makeNewForeignKeyColumn(ref.foreignKeyColumn)
      );
      progress.push(refProgress);
    }

    return progress;
  }

  private async checkTableProgress(
    client: PoolClient,
    tableName: string,
    targetColumn: string
  ): Promise<MigrationProgress> {
    const { rows } = await this.executeSql<{
      total_rows: number;
      migrated_rows: number;
      progress_percentage: string;
    }>(
      client,
      `
      SELECT
        COUNT(*)::bigint as total_rows,
        COUNT(${targetColumn})::bigint as migrated_rows,
        ROUND((COUNT(${targetColumn})::numeric / NULLIF(COUNT(*)::numeric, 0) * 100), 2) as progress_percentage
      FROM ${tableName}
    `
    );

    return {
      tableName,
      totalRows: rows[0].total_rows,
      migratedRows: rows[0].migrated_rows,
      progressPercentage: parseInt(rows[0].progress_percentage, 10),
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
    const migration = new IntToBigIntMigration(database, {
      tableName: table,
      schemaName: schema,
      batchSize,
      timeoutSeconds: timeout,
      dryRun: !execute,
    });

    await migration.execute(step as MigrationStepType);
  }
);
