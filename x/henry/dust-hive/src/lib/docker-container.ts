// Shared Docker container management utilities

export interface ContainerConfig {
  name: string;
  image: string;
  port: { host: number; container: number };
  env?: Record<string, string>;
  readinessCheck: (containerName: string) => Promise<boolean>;
}

// Check if a container is running
export async function isContainerRunning(containerName: string): Promise<boolean> {
  const proc = Bun.spawn(["docker", "inspect", "-f", "{{.State.Running}}", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;

  return proc.exitCode === 0 && output.trim() === "true";
}

// Check if a container exists (running or stopped)
export async function containerExists(containerName: string): Promise<boolean> {
  const proc = Bun.spawn(["docker", "inspect", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Wait for a container to be ready using the provided readiness check
export async function waitForContainerReady(
  containerName: string,
  readinessCheck: (name: string) => Promise<boolean>,
  timeoutMs = 30000
): Promise<boolean> {
  const start = Date.now();
  const pollIntervalMs = 500;

  while (Date.now() - start < timeoutMs) {
    if (await readinessCheck(containerName)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  return false;
}

// Start a container (creates if doesn't exist, starts if stopped)
export async function startContainer(config: ContainerConfig): Promise<{
  success: boolean;
  error?: string;
  alreadyRunning?: boolean;
}> {
  // Check if already running
  if (await isContainerRunning(config.name)) {
    return { success: true, alreadyRunning: true };
  }

  // Check if container exists but is stopped
  if (await containerExists(config.name)) {
    const proc = Bun.spawn(["docker", "start", config.name], {
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
    const args = [
      "docker",
      "run",
      "-d",
      "--name",
      config.name,
      "-p",
      `${config.port.host}:${config.port.container}`,
    ];

    // Add environment variables
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }

    args.push(config.image);

    const proc = Bun.spawn(args, {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;

    if (proc.exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text();
      return { success: false, error: `Failed to create container: ${stderr}` };
    }
  }

  // Wait for container to be ready
  const ready = await waitForContainerReady(config.name, config.readinessCheck);
  if (!ready) {
    return { success: false, error: `${config.name} container started but not responding` };
  }

  return { success: true, alreadyRunning: false };
}

// Stop a container
export async function stopContainer(
  containerName: string
): Promise<{ success: boolean; wasRunning: boolean }> {
  if (!(await isContainerRunning(containerName))) {
    return { success: true, wasRunning: false };
  }

  const proc = Bun.spawn(["docker", "stop", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;

  return { success: proc.exitCode === 0, wasRunning: true };
}

// Readiness check for Postgres
export async function postgresReadinessCheck(
  containerName: string,
  user: string
): Promise<boolean> {
  const proc = Bun.spawn(["docker", "exec", containerName, "pg_isready", "-U", user], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Readiness check for Redis
export async function redisReadinessCheck(containerName: string): Promise<boolean> {
  const proc = Bun.spawn(["docker", "exec", containerName, "redis-cli", "ping"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  return proc.exitCode === 0 && output.trim() === "PONG";
}
