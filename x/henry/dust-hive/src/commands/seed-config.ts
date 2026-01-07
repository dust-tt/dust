import { logger } from "../lib/logger";
import { SEED_USER_PATH } from "../lib/paths";
import { CommandError, Err, Ok, type Result } from "../lib/result";

export interface SeedUserConfig {
  sId: string;
  username: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string | null;
  workOSUserId: string | null;
  provider: string | null;
  providerId: string | null;
  imageUrl: string | null;
  workspaceSId: string;
  workspaceName: string;
  extractedAt: string;
  sourceUri: string;
}

async function runPsqlQuery(uri: string, query: string): Promise<Result<string, CommandError>> {
  const proc = Bun.spawn(["psql", uri, "-t", "-A", "-F", "\t", "-c", query], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    return Err(new CommandError(stderr.trim() || "Query failed"));
  }
  return Ok(stdout.trim());
}

async function extractUser(postgresUri: string): Promise<Result<string[], CommandError>> {
  const query = `
    SELECT u."sId", u.username, u.email, u.name, u."firstName", u."lastName",
           u."workOSUserId", u.provider, u."providerId", u."imageUrl"
    FROM users u
    WHERE u."workOSUserId" IS NOT NULL
    ORDER BY u."lastLoginAt" DESC NULLS LAST, u."createdAt" DESC
    LIMIT 1;
  `;

  const result = await runPsqlQuery(postgresUri, query);
  if (!result.ok) {
    return Err(new CommandError(`Failed to query user: ${result.error.message}`));
  }

  if (!result.value) {
    return Err(
      new CommandError(
        "No user with workOSUserId found. Make sure you have logged in at least once."
      )
    );
  }

  const fields = result.value.split("\t");
  if (fields.length < 10) {
    return Err(new CommandError(`Unexpected user data format: ${result.value}`));
  }

  return Ok(fields);
}

async function extractWorkspace(
  postgresUri: string,
  userSId: string
): Promise<Result<{ sId: string; name: string } | null, CommandError>> {
  const query = `
    SELECT w."sId", w.name FROM workspaces w
    JOIN memberships m ON m."workspaceId" = w.id
    JOIN users u ON u.id = m."userId"
    WHERE u."sId" = '${userSId}' AND m.role = 'admin'
      AND (m."endAt" IS NULL OR m."endAt" > NOW())
    ORDER BY w."createdAt" ASC LIMIT 1;
  `;

  const result = await runPsqlQuery(postgresUri, query);
  if (!result.ok) {
    return Err(new CommandError(`Failed to query workspace: ${result.error.message}`));
  }

  if (!result.value) {
    return Ok(null);
  }

  const fields = result.value.split("\t");
  return Ok({ sId: fields[0] ?? "", name: fields[1] ?? "" });
}

function resolveWorkspace(
  result: { sId: string; name: string } | null,
  userSId: string,
  firstName: string
): { sId: string; name: string } {
  if (result) {
    logger.success(`Found workspace: ${result.name} (${result.sId})`);
    return result;
  }
  logger.warn("No workspace found for user, will create a new one during seed");
  return { sId: `dev-${userSId.slice(0, 6)}`, name: `${firstName}'s Dev Workspace` };
}

export async function seedConfigCommand(postgresUri?: string): Promise<Result<void>> {
  if (!postgresUri) {
    return Err(
      new CommandError(
        "Usage: dust-hive seed-config <postgres-uri>\n\nExample: dust-hive seed-config 'postgres://dev:dev@localhost:5432/dust_front'"
      )
    );
  }

  logger.info("Extracting user data from existing database...");

  const userResult = await extractUser(postgresUri);
  if (!userResult.ok) {
    return userResult;
  }

  const f = userResult.value;
  const sId = f[0] ?? "";
  const firstName = f[4] ?? "";

  logger.success(`Found user: ${f[2]} (${f[3]})`);

  const workspaceResult = await extractWorkspace(postgresUri, sId);
  if (!workspaceResult.ok) {
    return workspaceResult;
  }

  const workspace = resolveWorkspace(workspaceResult.value, sId, firstName);

  const config: SeedUserConfig = {
    sId,
    username: f[1] ?? "",
    email: f[2] ?? "",
    name: f[3] ?? "",
    firstName,
    lastName: f[5] || null,
    workOSUserId: f[6] || null,
    provider: f[7] || null,
    providerId: f[8] || null,
    imageUrl: f[9] || null,
    workspaceSId: workspace.sId,
    workspaceName: workspace.name,
    extractedAt: new Date().toISOString(),
    sourceUri: postgresUri.replace(/:[^:@]+@/, ":***@"),
  };

  await Bun.write(SEED_USER_PATH, JSON.stringify(config, null, 2));

  console.log();
  logger.success(`Seed config saved to ${SEED_USER_PATH}`);
  console.log();
  console.log("User details:");
  console.log(`  Email:       ${config.email}`);
  console.log(`  Name:        ${config.name}`);
  console.log(`  WorkOS ID:   ${config.workOSUserId || "(none)"}`);
  console.log(`  Workspace:   ${config.workspaceName}`);
  console.log();
  console.log("Next time you run 'dust-hive warm', your database will be seeded with this user.");
  console.log();

  return Ok(undefined);
}
