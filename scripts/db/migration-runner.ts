import { execFileSync } from "child_process";
import { QueryTypes } from "sequelize";
import type { Sequelize } from "sequelize";
import type { MigrationParams } from "umzug";
import { Umzug } from "umzug";

const PHASES = ["pre-deploy", "post-deploy"] as const;
type Phase = (typeof PHASES)[number];
type Command =
  | Phase
  | "status"
  | "check"
  | "check-pre-deploy"
  | "check-post-deploy";

export interface MigrationLogger {
  debug: (obj: Record<string, unknown>, msg?: string) => void;
  info: (obj: Record<string, unknown>, msg?: string) => void;
  warn: (obj: Record<string, unknown>, msg?: string) => void;
  error: (obj: Record<string, unknown>, msg?: string) => void;
}

async function ensureSchemaMigrationsTable(
  sequelize: Sequelize
): Promise<void> {
  // biome-ignore lint/plugin/noRawSql: migration runner bootstraps its own table.
  await sequelize.query(
    `CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name"       VARCHAR(255) PRIMARY KEY,
      "phase"      VARCHAR(20)  NOT NULL,
      "applied_at" TIMESTAMP    NOT NULL DEFAULT NOW(),
      UNIQUE ("name", "phase")
    )`
  );
}

class PhasedSequelizeStorage {
  constructor(
    private readonly sequelize: Sequelize,
    private readonly phase: Phase
  ) {}

  async logMigration({ name }: { name: string }): Promise<void> {
    // biome-ignore lint/plugin/noRawSql: schema_migrations is the migration runner's own ledger.
    await this.sequelize.query(
      `INSERT INTO "schema_migrations" ("name", "phase") VALUES (:name, :phase)`,
      {
        replacements: { name, phase: this.phase },
        type: QueryTypes.INSERT,
      }
    );
  }

  async unlogMigration(_: { name: string }): Promise<void> {
    throw new Error("Rolling back migrations is not supported.");
  }

  async executed(): Promise<string[]> {
    // biome-ignore lint/plugin/noRawSql: schema_migrations is the migration runner's own ledger.
    const rows = await this.sequelize.query<{ name: string }>(
      `SELECT "name" FROM "schema_migrations" WHERE "phase" = :phase ORDER BY "name"`,
      {
        replacements: { phase: this.phase },
        type: QueryTypes.SELECT,
      }
    );
    return rows.map((r) => r.name);
  }
}

function createUmzug(
  sequelize: Sequelize,
  getDatabaseURI: () => string,
  logger: MigrationLogger,
  phase: Phase
) {
  return new Umzug({
    migrations: {
      glob: `migrations/${phase}/*.sql`,
      resolve: ({ name, path: filePath }: MigrationParams<unknown>) => ({
        // Prefix with phase so pre- and post-deploy migrations never collide on
        // a same filename.
        name: `${phase}/${name}`,
        up: async () => {
          if (!filePath) {
            throw new Error(`Missing path for migration ${name}.`);
          }
          // Use psql -f so the file runs in a single direct PostgreSQL session,
          // bypassing pgbouncer. This is required because pg-schema-diff emits
          // files that mix SET SESSION, regular DDL, and CREATE/DROP INDEX
          // CONCURRENTLY — the latter two require autocommit, which pgbouncer's
          // transaction-pooling mode would break if we used a library client.
          try {
            execFileSync("psql", ["--version"], { stdio: "pipe" });
          } catch {
            throw new Error(
              "psql is not available — install the PostgreSQL client tools."
            );
          }
          execFileSync(
            "psql",
            [getDatabaseURI(), "-v", "ON_ERROR_STOP=1", "-f", filePath],
            { stdio: "inherit" }
          );
        },
        // Down migrations are intentionally not supported. The expand/contract
        // pattern means rolling back a schema change is a new forward migration.
        down: async () => {
          throw new Error("Down migrations are not supported.");
        },
      }),
    },
    context: sequelize.getQueryInterface(),
    storage: new PhasedSequelizeStorage(sequelize, phase),
    logger: {
      debug: (msg: unknown) => logger.debug(msg as Record<string, unknown>),
      info: (msg: unknown) => logger.info(msg as Record<string, unknown>),
      warn: (msg: unknown) => logger.warn(msg as Record<string, unknown>),
      error: (msg: unknown) => logger.error(msg as Record<string, unknown>),
    },
  });
}

async function runUp(
  sequelize: Sequelize,
  getDatabaseURI: () => string,
  logger: MigrationLogger,
  phase: Phase
): Promise<void> {
  const umzug = createUmzug(sequelize, getDatabaseURI, logger, phase);
  const applied = await umzug.up();
  if (applied.length === 0) {
    logger.info({ phase }, "No pending migrations.");
    return;
  }
  logger.info(
    { phase, count: applied.length, names: applied.map((m) => m.name) },
    "Migrations applied."
  );
}

async function runStatus(
  sequelize: Sequelize,
  getDatabaseURI: () => string,
  logger: MigrationLogger
): Promise<void> {
  for (const phase of PHASES) {
    const pending = await createUmzug(
      sequelize,
      getDatabaseURI,
      logger,
      phase
    ).pending();
    logger.info(
      { phase, count: pending.length, names: pending.map((m) => m.name) },
      "Pending migrations."
    );
  }
}

async function runCheckPhase(
  sequelize: Sequelize,
  getDatabaseURI: () => string,
  logger: MigrationLogger,
  phase: Phase
): Promise<void> {
  const pending = await createUmzug(
    sequelize,
    getDatabaseURI,
    logger,
    phase
  ).pending();
  if (pending.length > 0) {
    logger.error(
      { phase, count: pending.length, names: pending.map((m) => m.name) },
      "Pending migrations found — deploy blocked."
    );
    process.exit(1);
  }
  logger.info({ phase }, "All migrations applied.");
}

function assertNever(x: never): never {
  throw new Error(`Unexpected migration command: ${JSON.stringify(x)}`);
}

export async function runMigrations({
  sequelize,
  getDatabaseURI,
  logger,
  command,
}: {
  sequelize: Sequelize;
  getDatabaseURI: () => string;
  logger: MigrationLogger;
  command: string;
}): Promise<void> {
  await ensureSchemaMigrationsTable(sequelize);

  const typedCommand = command as Command;
  switch (typedCommand) {
    case "pre-deploy":
    case "post-deploy":
      await runUp(sequelize, getDatabaseURI, logger, typedCommand);
      break;
    case "status":
      await runStatus(sequelize, getDatabaseURI, logger);
      break;
    case "check":
    case "check-pre-deploy":
      await runCheckPhase(sequelize, getDatabaseURI, logger, "pre-deploy");
      break;
    case "check-post-deploy":
      await runCheckPhase(sequelize, getDatabaseURI, logger, "post-deploy");
      break;
    default:
      assertNever(typedCommand);
  }
}
