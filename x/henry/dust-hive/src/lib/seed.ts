// Fast SQL-based seeding for dust-hive dev environments
//
// This replaces the slow TypeScript-based seed process with raw SQL.
// The SQL is executed via psql for maximum speed (no Node runtime overhead for the DB work).
//
// MAINTAINABILITY:
// - The seed.sql file uses exact column names from Sequelize models
// - If schema changes, the SQL will fail with clear error messages
// - The SQL can be validated by running it against a fresh DB
// - This file only handles sId generation and parameter passing

import { join } from "node:path";

import type { Environment } from "./environment";
import { logger } from "./logger";
import { DUST_HIVE_ROOT, SEED_USER_PATH, getEnvFilePath } from "./paths";

// Generate a random 10-character alphanumeric ID
// This is compatible with front's generateRandomModelSId() output format
function generateRandomModelSId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let result = "";
  for (let i = 0; i < 10; i++) {
    // biome-ignore lint/style/noNonNullAssertion: bytes[i] is always defined for i < 10
    result += chars[bytes[i]! % chars.length];
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

// Load environment variables from env.sh
async function loadEnvVars(envShPath: string): Promise<Record<string, string>> {
  const command = `source "${envShPath}" && env`;
  const proc = Bun.spawn(["bash", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const output = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`Failed to load env vars: ${stderr.trim() || "unknown error"}`);
  }

  const env: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const idx = line.indexOf("=");
    if (idx > 0) {
      env[line.substring(0, idx)] = line.substring(idx + 1);
    }
  }
  return env;
}

function buildDatabaseUri(envVars: Record<string, string>): string {
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  const host = envVars["POSTGRES_HOST"] ?? "localhost";
  // biome-ignore lint/complexity/useLiteralKeys: must use bracket notation for Record type
  const port = envVars["POSTGRES_PORT"] ?? "5432";
  return `postgres://dev:dev@${host}:${port}/dust_front`;
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

  // Read the SQL file
  const sqlPath = join(DUST_HIVE_ROOT, "seed.sql");
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

  // Replace placeholders with actual values
  // Using negative lookahead to avoid replacing $10 when replacing $1
  const finalSql = sql
    .replace(/\$1(?!\d)/g, escapeSql(userSid))
    .replace(/\$2(?!\d)/g, escapeSql(workspaceSid))
    .replace(/\$3(?!\d)/g, escapeSql(subscriptionSid))
    .replace(/\$4(?!\d)/g, escapeSql(config.email))
    .replace(/\$5(?!\d)/g, escapeSql(username))
    .replace(/\$6(?!\d)/g, escapeSql(config.name))
    .replace(/\$7(?!\d)/g, escapeSql(config.firstName))
    .replace(/\$8(?!\d)/g, escapeSql(config.lastName))
    .replace(/\$9(?!\d)/g, escapeSql(config.workspaceName))
    .replace(/\$10(?!\d)/g, escapeSql(config.workOSUserId))
    .replace(/\$11(?!\d)/g, escapeSql(config.provider))
    .replace(/\$12(?!\d)/g, escapeSql(config.providerId))
    .replace(/\$13(?!\d)/g, escapeSql(config.imageUrl));

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
