// Shared test Postgres management (global container, not per-environment)
// Each environment gets its own database within this container.

import {
  type ContainerConfig,
  isContainerRunning,
  postgresReadinessCheck,
  startContainer,
  stopContainer,
} from "./docker-container";
import {
  TEST_POSTGRES_CONTAINER_NAME,
  TEST_POSTGRES_PASSWORD,
  TEST_POSTGRES_PORT,
  TEST_POSTGRES_USER,
} from "./paths";

const TEST_POSTGRES_CONFIG: ContainerConfig = {
  name: TEST_POSTGRES_CONTAINER_NAME,
  image: "postgres:15",
  port: { host: TEST_POSTGRES_PORT, container: 5432 },
  env: {
    POSTGRES_USER: TEST_POSTGRES_USER,
    POSTGRES_PASSWORD: TEST_POSTGRES_PASSWORD,
    POSTGRES_DB: "postgres",
  },
  readinessCheck: (name) => postgresReadinessCheck(name, TEST_POSTGRES_USER),
};

// Check if the test postgres container is running
export async function isTestPostgresRunning(): Promise<boolean> {
  return isContainerRunning(TEST_POSTGRES_CONTAINER_NAME);
}

// Start the shared test postgres container
export async function startTestPostgres(): Promise<{
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}> {
  return startContainer(TEST_POSTGRES_CONFIG);
}

// Stop the shared test postgres container
export async function stopTestPostgres(): Promise<{ success: boolean; wasRunning: boolean }> {
  return stopContainer(TEST_POSTGRES_CONTAINER_NAME);
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
  // Must connect to 'postgres' db since the default db (username) doesn't exist
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      TEST_POSTGRES_CONTAINER_NAME,
      "psql",
      "-U",
      TEST_POSTGRES_USER,
      "-d",
      "postgres",
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
  // Must connect to 'postgres' db since the default db (username) doesn't exist
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      TEST_POSTGRES_CONTAINER_NAME,
      "psql",
      "-U",
      TEST_POSTGRES_USER,
      "-d",
      "postgres",
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
