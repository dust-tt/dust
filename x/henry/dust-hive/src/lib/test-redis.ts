// Shared test Redis management (global container, not per-environment)
// All environments share the same Redis instance for testing.

import { TEST_REDIS_CONTAINER_NAME, TEST_REDIS_PORT } from "./paths";

// Check if the test Redis container is running
export async function isTestRedisRunning(): Promise<boolean> {
  const proc = Bun.spawn(
    ["docker", "inspect", "-f", "{{.State.Running}}", TEST_REDIS_CONTAINER_NAME],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return proc.exitCode === 0 && output.trim() === "true";
}

// Check if the test Redis container exists (running or stopped)
async function containerExists(): Promise<boolean> {
  const proc = Bun.spawn(["docker", "inspect", TEST_REDIS_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Wait for Redis to be ready to accept connections
async function waitForRedisReady(timeoutMs = 30000): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const proc = Bun.spawn(["docker", "exec", TEST_REDIS_CONTAINER_NAME, "redis-cli", "ping"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode === 0 && output.trim() === "PONG") {
      return true;
    }

    const pollIntervalMs = 500;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

// Start the shared test Redis container
export async function startTestRedis(): Promise<{
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}> {
  // Check if already running
  if (await isTestRedisRunning()) {
    return { success: true, alreadyRunning: true };
  }

  // Check if container exists but is stopped
  if (await containerExists()) {
    const proc = Bun.spawn(["docker", "start", TEST_REDIS_CONTAINER_NAME], {
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
        TEST_REDIS_CONTAINER_NAME,
        "-p",
        `${TEST_REDIS_PORT}:6379`,
        "redis:7-alpine",
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

  // Wait for Redis to be ready
  const ready = await waitForRedisReady();
  if (!ready) {
    return { success: false, error: "Redis container started but not responding" };
  }

  return { success: true, alreadyRunning: false };
}

// Stop the shared test Redis container
export async function stopTestRedis(): Promise<{ success: boolean; wasRunning: boolean }> {
  if (!(await isTestRedisRunning())) {
    return { success: true, wasRunning: false };
  }

  const proc = Bun.spawn(["docker", "stop", TEST_REDIS_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  return { success: proc.exitCode === 0, wasRunning: true };
}

// Remove the shared test Redis container
export async function removeTestRedis(): Promise<{ success: boolean }> {
  // Stop first if running
  await stopTestRedis();

  // Remove container
  const proc = Bun.spawn(["docker", "rm", "-v", TEST_REDIS_CONTAINER_NAME], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  // Success even if container didn't exist
  return { success: true };
}

// Get the connection URI for the test Redis
export function getTestRedisUri(): string {
  return `redis://localhost:${TEST_REDIS_PORT}`;
}
