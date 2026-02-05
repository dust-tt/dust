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
import { buildShell, shellQuote } from "./shell";

const SEEDED_WORKSPACE_SID = "DevWkSpace";

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

async function listActiveSeededUserSids({
  databaseUri,
  workspaceSid,
}: {
  databaseUri: string;
  workspaceSid: string;
}): Promise<string[]> {
  const escapedWorkspaceSid = workspaceSid.replace(/'/g, "''");

  const query = `
SELECT DISTINCT u."sId"
FROM users u
JOIN memberships m ON m."userId" = u.id
JOIN workspaces w ON w.id = m."workspaceId"
WHERE w."sId" = '${escapedWorkspaceSid}'
  AND m."startAt" <= NOW()
  AND (m."endAt" IS NULL OR m."endAt" > NOW());
  `;

  const proc = Bun.spawn(["psql", databaseUri, "-tAc", query], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(
      `Failed to query seeded users for indexing: ${stderr.trim() || "unknown error"}`
    );
  }

  const userSids = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return [...new Set(userSids)];
}

async function queueUserSearchIndexationWorkflows({
  envShPath,
  worktreePath,
  userSids,
}: {
  envShPath: string;
  worktreePath: string;
  userSids: string[];
}): Promise<{ success: boolean; stdout: string; stderr: string }> {
  const inlineScript = [
    "(async () => {",
    "const { launchIndexUserSearchWorkflow } = await import('@app/temporal/es_indexation/client');",
    "const rawUserSids = process.env.DUST_HIVE_SEED_USER_SIDS;",
    "if (!rawUserSids) {",
    "throw new Error('DUST_HIVE_SEED_USER_SIDS is required');",
    "}",
    "const parsed = JSON.parse(rawUserSids);",
    "if (!Array.isArray(parsed)) {",
    "throw new Error('DUST_HIVE_SEED_USER_SIDS must be a JSON array');",
    "}",
    "for (const userId of parsed) {",
    "if (typeof userId !== 'string') {",
    "throw new Error('DUST_HIVE_SEED_USER_SIDS entries must be strings');",
    "}",
    "const workflowResult = await launchIndexUserSearchWorkflow({ userId });",
    "if (workflowResult.isErr()) {",
    "throw workflowResult.error;",
    "}",
    "console.log(`Queued user search workflow for ${userId}`);",
    "}",
    "})().catch((error) => {",
    "console.error(error);",
    "process.exit(1);",
    "});",
  ].join(" ");

  const command = buildShell({
    sourceEnv: envShPath,
    sourceNvm: true,
    run: `npx tsx -e ${shellQuote(inlineScript)}`,
  });

  const proc = Bun.spawn(["bash", "-c", command], {
    cwd: `${worktreePath}/front`,
    env: {
      ...process.env,
      DUST_HIVE_SEED_USER_SIDS: JSON.stringify(userSids),
    },
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  return {
    success: proc.exitCode === 0,
    stdout,
    stderr,
  };
}

async function queueSeededUsersForUserSearchIndexation({
  databaseUri,
  workspaceSid,
  envShPath,
  worktreePath,
}: {
  databaseUri: string;
  workspaceSid: string;
  envShPath: string;
  worktreePath: string;
}): Promise<void> {
  const seededUserSids = await listActiveSeededUserSids({
    databaseUri,
    workspaceSid,
  });

  if (seededUserSids.length === 0) {
    logger.warn("No active seeded users found for user search indexing.");
    return;
  }

  logger.step(`Queueing user search indexing workflows (${seededUserSids.length} user(s))...`);

  const queueResult = await queueUserSearchIndexationWorkflows({
    envShPath,
    worktreePath,
    userSids: seededUserSids,
  });

  if (!queueResult.success) {
    logger.warn("Failed to queue user search indexing workflows. Continuing.");
    if (queueResult.stdout.trim()) {
      console.log(queueResult.stdout);
    }
    if (queueResult.stderr.trim()) {
      console.error(queueResult.stderr);
    }
    return;
  }

  logger.success(`Queued user search indexing workflows for ${seededUserSids.length} user(s)`);
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

  // Generate sIds - workspace uses static ID for consistency across environments
  const userSid = config.sId ?? generateRandomModelSId();
  const workspaceSid = SEEDED_WORKSPACE_SID;
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

  // Parse output to verify subscription was created
  // Output format: " user_id | workspace_id | subscription_id \n---------+--------------+-----------------\n 1 | 1 | 1"
  const subscriptionCreated = verifySubscriptionCreated(stdout);
  if (!subscriptionCreated) {
    logger.error("SQL seed failed: subscription was not created.");
    logger.error("This usually means the FREE_UPGRADED_PLAN doesn't exist in the plans table.");
    logger.error("Ensure init_plans.sh ran successfully before seeding.");
    if (stdout.trim()) console.log(stdout);
    return false;
  }

  // Log created workspace
  console.log(`  Created user: ${config.email}`);
  console.log(`  Created workspace: ${config.workspaceName}`);
  console.log("  Created membership");
  console.log("  Created subscription");

  await queueSeededUsersForUserSearchIndexation({
    databaseUri: dbUri,
    workspaceSid,
    envShPath,
    worktreePath,
  }).catch((error) => {
    logger.warn(
      `Failed to queue user search indexing workflows: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  });

  logger.success("Database seeded with dev user (SQL)");
  return true;
}

// Verify that the SQL seed output includes a non-null subscription_id
function verifySubscriptionCreated(stdout: string): boolean {
  // psql output format for SELECT with 3 columns:
  // " user_id | workspace_id | subscription_id "
  // "---------+--------------+-----------------"
  // "       1 |            1 |               1"
  // "(1 row)"
  //
  // If subscription wasn't created, subscription_id will be empty:
  // "       1 |            1 |                "

  const lines = stdout.trim().split("\n");
  // Find the data row (skip header and separator)
  const dataLine = lines.find(
    (line) => line.includes("|") && !line.includes("user_id") && !line.includes("---")
  );

  if (!dataLine) {
    return false;
  }

  const parts = dataLine.split("|").map((p) => p.trim());
  // subscription_id is the third column (index 2)
  const subscriptionId = parts[2];

  // Check if subscription_id is a non-empty number
  return subscriptionId !== "" && !Number.isNaN(Number(subscriptionId));
}
