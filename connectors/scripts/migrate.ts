import logger from "@connectors/logger/logger";
import { connectorsSequelize } from "@connectors/resources/storage";
import { dbConfig } from "@connectors/resources/storage/config";
import { assertNever } from "@dust-tt/client";
import { execFileSync } from "child_process";
import { QueryTypes } from "sequelize";
import type { MigrationParams } from "umzug";
import { Umzug } from "umzug";
import { makeScript } from "./helpers";

const PHASES = ["pre-deploy", "post-deploy"] as const;
type Phase = (typeof PHASES)[number];
type Command =
  | Phase
  | "status"
  | "check"
  | "check-pre-deploy"
  | "check-post-deploy";

async function ensureSchemaMigrationsTable(): Promise<void> {
  await connectorsSequelize.query(
    `CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name"       VARCHAR(255) PRIMARY KEY,
      "phase"      VARCHAR(20)  NOT NULL,
      "applied_at" TIMESTAMP    NOT NULL DEFAULT NOW(),
      UNIQUE ("name", "phase")
    )`
  );
}

// Custom Umzug storage that writes both the migration name and its phase, so
// pre-deploy and post-deploy migrations can be counted independently (used by
// the deploy gate).
class PhasedSequelizeStorage {
  constructor(private readonly phase: Phase) {}

  async logMigration({ name }: { name: string }): Promise<void> {
    await connectorsSequelize.query(
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
    const rows = await connectorsSequelize.query<{ name: string }>(
      `SELECT "name" FROM "schema_migrations" WHERE "phase" = :phase ORDER BY "name"`,
      {
        replacements: { phase: this.phase },
        type: QueryTypes.SELECT,
      }
    );
    return rows.map((r) => r.name);
  }
}

function createUmzug(phase: Phase) {
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
            [dbConfig.getRequiredDatabaseURI(), "-f", filePath],
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
    context: connectorsSequelize.getQueryInterface(),
    storage: new PhasedSequelizeStorage(phase),
    logger: {
      debug: (msg: unknown) => logger.debug(msg as Record<string, unknown>),
      info: (msg: unknown) => logger.info(msg as Record<string, unknown>),
      warn: (msg: unknown) => logger.warn(msg as Record<string, unknown>),
      error: (msg: unknown) => logger.error(msg as Record<string, unknown>),
    },
  });
}

async function runUp(phase: Phase): Promise<void> {
  const umzug = createUmzug(phase);
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

async function runStatus(): Promise<void> {
  for (const phase of PHASES) {
    const pending = await createUmzug(phase).pending();
    logger.info(
      { phase, count: pending.length, names: pending.map((m) => m.name) },
      "Pending migrations."
    );
  }
}

async function runCheckPhase(phase: Phase): Promise<void> {
  const pending = await createUmzug(phase).pending();
  if (pending.length > 0) {
    logger.error(
      { phase, count: pending.length, names: pending.map((m) => m.name) },
      "Pending migrations found — deploy blocked."
    );
    process.exit(1);
  }
  logger.info({ phase }, "All migrations applied.");
}

makeScript(
  {
    command: {
      type: "string",
      choices: [
        "pre-deploy",
        "post-deploy",
        "status",
        "check",
        "check-pre-deploy",
        "check-post-deploy",
      ],
      demandOption: true,
      describe: "Migration command to run.",
    },
  },
  async ({ command, execute }) => {
    if (!execute) {
      return;
    }

    await ensureSchemaMigrationsTable();

    const typedCommand = command as Command;
    switch (typedCommand) {
      case "pre-deploy":
      case "post-deploy":
        await runUp(typedCommand);
        break;
      case "status":
        await runStatus();
        break;
      case "check":
      case "check-pre-deploy":
        await runCheckPhase("pre-deploy");
        break;
      case "check-post-deploy":
        await runCheckPhase("post-deploy");
        break;
      default:
        assertNever(typedCommand);
    }

    await connectorsSequelize.close();
  }
);
