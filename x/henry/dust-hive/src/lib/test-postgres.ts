// Shared test Postgres management (global container, not per-environment)
// Each environment gets its own database within this container.

import {
  TEST_POSTGRES_CONTAINER_NAME,
  TEST_POSTGRES_PASSWORD,
  TEST_POSTGRES_PORT,
  TEST_POSTGRES_USER,
} from "./paths";

// Check if the test postgres container is running
export async function isTestPostgresRunning(): Promise<boolean> {
  const proc = Bun.spawn(
    ["docker", "inspect", "-f", "{{.State.Running}}", TEST_POSTGRES_CONTAINER_NAME],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return proc.exitCode === 0 && output.trim() === "true";
}

// Check if the test postgres container exists (running or stopped)
async function containerExists(): Promise<boolean> {
  const proc = Bun.spawn(["docker", "inspect", TEST_POSTGRES_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Wait for postgres to be ready to accept connections
async function waitForPostgresReady(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const proc = Bun.spawn(
      ["docker", "exec", TEST_POSTGRES_CONTAINER_NAME, "pg_isready", "-U", TEST_POSTGRES_USER],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    await proc.exited;

    if (proc.exitCode === 0) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

// Start the shared test postgres container
export async function startTestPostgres(): Promise<{
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}> {
  // Check if already running
  if (await isTestPostgresRunning()) {
    return { success: true, alreadyRunning: true };
  }

  // Check if container exists but is stopped
  if (await containerExists()) {
    const proc = Bun.spawn(["docker", "start", TEST_POSTGRES_CONTAINER_NAME], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: `Failed to start existing container: ${stderr}` };
    }
  } else {
    // Create new container
    const proc = Bun.spawn(
      [
        "docker",
        "run",
        "-d",
        "--name",
        TEST_POSTGRES_CONTAINER_NAME,
        "-e",
        `POSTGRES_USER=${TEST_POSTGRES_USER}`,
        "-e",
        `POSTGRES_PASSWORD=${TEST_POSTGRES_PASSWORD}`,
        "-e",
        "POSTGRES_DB=postgres",
        "-p",
        `${TEST_POSTGRES_PORT}:5432`,
        "postgres:15",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: `Failed to create container: ${stderr}` };
    }
  }

  // Wait for postgres to be ready
  const ready = await waitForPostgresReady();
  if (!ready) {
    return { success: false, error: "Postgres container started but not responding" };
  }

  return { success: true, alreadyRunning: false };
}

// Stop the shared test postgres container
export async function stopTestPostgres(): Promise<{ success: boolean; wasRunning: boolean }> {
  if (!(await isTestPostgresRunning())) {
    return { success: true, wasRunning: false };
  }

  const proc = Bun.spawn(["docker", "stop", TEST_POSTGRES_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  return { success: proc.exitCode === 0, wasRunning: true };
}

// Remove the shared test postgres container (including volumes)
export async function removeTestPostgres(): Promise<{ success: boolean }> {
  // Stop first if running
  await stopTestPostgres();

  // Remove container
  const proc = Bun.spawn(["docker", "rm", "-v", TEST_POSTGRES_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  // Success even if container didn't exist
  return { success: true };
}

// Get the test database name for an environment
export function getTestDatabaseName(envName: string): string {
  // Sanitize env name for postgres (replace dashes with underscores)
  const sanitized = envName.replace(/-/g, "_");
  return `dust_front_test_${sanitized}`;
}

// Get the connection URI for a test database
export function getTestDatabaseUri(envName: string): string {
  const dbName = getTestDatabaseName(envName);
  return `postgres://${TEST_POSTGRES_USER}:${TEST_POSTGRES_PASSWORD}@localhost:${TEST_POSTGRES_PORT}/${dbName}`;
}

// Create a test database for an environment
export async function createTestDatabase(envName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const dbName = getTestDatabaseName(envName);

  // Check if postgres is running
  if (!(await isTestPostgresRunning())) {
    return { success: false, error: "Test postgres is not running. Run 'dust-hive up' first." };
  }

  // Create database if it doesn't exist
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      TEST_POSTGRES_CONTAINER_NAME,
      "psql",
      "-U",
      TEST_POSTGRES_USER,
      "-c",
      `CREATE DATABASE ${dbName};`,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  // Success if created or already exists
  if (proc.exitCode === 0 || stderr.includes("already exists")) {
    return { success: true };
  }

  return { success: false, error: stderr };
}

// Drop a test database for an environment
export async function dropTestDatabase(envName: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const dbName = getTestDatabaseName(envName);

  // Check if postgres is running
  if (!(await isTestPostgresRunning())) {
    // If postgres is not running, we can't drop the DB but that's okay
    return { success: true };
  }

  // Terminate existing connections and drop
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      TEST_POSTGRES_CONTAINER_NAME,
      "psql",
      "-U",
      TEST_POSTGRES_USER,
      "-c",
      `DROP DATABASE IF EXISTS ${dbName};`,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  await proc.exited;

  return { success: proc.exitCode === 0 };
}
