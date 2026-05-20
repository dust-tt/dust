import { connectorsSequelize } from "@connectors/resources/storage";
import { QueryTypes } from "sequelize";

export type MigrationPhase = "pre-deploy" | "post-deploy";

export type AppliedMigration = {
  name: string;
  phase: MigrationPhase;
};

// Returns the list of migrations applied by the Umzug runner for a given
// phase, ordered by name. Used by the deploy gate in CI to compare against
// the migrations shipping in the new release.
//
// Ensures the ledger table exists so the endpoint stays callable on a fresh
// region that has never run the runner yet (returns an empty list in that
// case).
export async function listAppliedMigrations(
  phase: MigrationPhase
): Promise<AppliedMigration[]> {
  // biome-ignore lint/plugin/noRawSql: schema_migrations is the migration runner's own ledger.
  await connectorsSequelize.query(
    `CREATE TABLE IF NOT EXISTS "schema_migrations" (
      "name" VARCHAR(255) PRIMARY KEY,
      "phase" VARCHAR(20) NOT NULL
    )`
  );
  // biome-ignore lint/plugin/noRawSql: schema_migrations is the migration runner's own ledger.
  const rows = await connectorsSequelize.query<AppliedMigration>(
    `SELECT "name", "phase" FROM "schema_migrations" WHERE "phase" = :phase ORDER BY "name"`,
    {
      replacements: { phase },
      type: QueryTypes.SELECT,
    }
  );
  return rows;
}
