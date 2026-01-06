// Fast SQL-based seeding for dust-hive dev environments
//
// This replaces the slow TypeScript-based seed process with raw SQL.
// The SQL is executed via psql for maximum speed (no Node runtime overhead for the DB work).
//
// SINGLE SOURCE OF TRUTH:
// The SQL is defined in front/lib/dev/dust_hive_seed.sql
// This file only handles sId generation and parameter passing.

import { buildPostgresUri, loadEnvVars } from "./env-utils";
import type { Environment } from "./environment";
import { logger } from "./logger";
import { SEED_USER_PATH, getEnvFilePath, getWorktreeDir } from "./paths";

// Generate a random 10-character alphanumeric ID
// This is compatible with front's generateRandomModelSId() output format
function generateRandomModelSId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let result = "";
  for (const byte of bytes) {
    result += chars[byte % chars.length];
  }
  return result;
}

interface SeedConfig {
  email: string;
  name: string;
  firstName: string;
  lastName?: string | null;
  workspaceName: string;
  sId?: string;
  username?: string;
  workOSUserId?: string | null;
  provider?: string | null;
  providerId?: string | null;
  imageUrl?: string | null;
}

async function loadSeedConfig(): Promise<SeedConfig | null> {
  const file = Bun.file(SEED_USER_PATH);
  if (!(await file.exists())) {
    return null;
  }
  return file.json();
}

function buildDatabaseUri(envVars: Record<string, string>): string {
  return buildPostgresUri(envVars, "dust_front");
}

export async function runSqlSeed(env: Environment): Promise<boolean> {
  const config = await loadSeedConfig();
  if (!config) {
    return false;
  }

  logger.step("Seeding database with dev user (SQL)...");

  const envShPath = getEnvFilePath(env.name);
  const envVars = await loadEnvVars(envShPath);
  const dbUri = buildDatabaseUri(envVars);

  // Generate random sIds
  const userSid = config.sId ?? generateRandomModelSId();
  const workspaceSid = generateRandomModelSId();
  const subscriptionSid = generateRandomModelSId();
  const username = config.username ?? config.email.split("@")[0];

  // Read the SQL file from front (single source of truth)
  const worktreePath = getWorktreeDir(env.name);
  const sqlPath = `${worktreePath}/front/lib/dev/dust_hive_seed.sql`;
  const sqlFile = Bun.file(sqlPath);
  if (!(await sqlFile.exists())) {
    logger.error(`SQL seed file not found at ${sqlPath}`);
    return false;
  }
  const sql = await sqlFile.text();

  // Escape SQL string values (single quotes doubled)
  const escapeSql = (s: string | null | undefined): string => {
    if (s === null || s === undefined) return "NULL";
    return `'${s.replace(/'/g, "''")}'`;
  };

  // Replace Sequelize-style :paramName placeholders with actual values
  // Use word boundaries to avoid partial matches (e.g., :provider matching :providerId)
  const finalSql = sql
    .replace(/:userSid\b/g, escapeSql(userSid))
    .replace(/:workspaceSid\b/g, escapeSql(workspaceSid))
    .replace(/:subscriptionSid\b/g, escapeSql(subscriptionSid))
    .replace(/:email\b/g, escapeSql(config.email))
    .replace(/:username\b/g, escapeSql(username))
    .replace(/:firstName\b/g, escapeSql(config.firstName))
    .replace(/:lastName\b/g, escapeSql(config.lastName))
    .replace(/:workspaceName\b/g, escapeSql(config.workspaceName))
    .replace(/:workOSUserId\b/g, escapeSql(config.workOSUserId))
    .replace(/:providerId\b/g, escapeSql(config.providerId))
    .replace(/:provider\b/g, escapeSql(config.provider))
    .replace(/:imageUrl\b/g, escapeSql(config.imageUrl))
    .replace(/:name\b/g, escapeSql(config.name));

  // Execute via psql
  const proc = Bun.spawn(["psql", dbUri, "-c", finalSql], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    logger.error("SQL seed failed:");
    if (stdout.trim()) console.log(stdout);
    if (stderr.trim()) console.error(stderr);
    return false;
  }

  // Log created workspace
  console.log(`  Created user: ${config.email}`);
  console.log(`  Created workspace: ${config.workspaceName}`);
  console.log("  Created membership");

  logger.success("Database seeded with dev user (SQL)");
  return true;
}
