import YAML from "yaml";
import type { Environment } from "./environment";
import { logger } from "./logger";
import { getDockerComposePath, getDockerOverridePath } from "./paths";
import type { PortAllocation } from "./ports";
import { Err, Ok, type Result } from "./result";

export interface DockerComposeOverride {
  services: {
    db: {
      ports: string[];
      volumes: string[];
    };
    redis: {
      ports: string[];
    };
    qdrant_primary: {
      ports: string[];
      volumes: string[];
    };
    qdrant_secondary: {
      volumes: string[];
    };
    elasticsearch: {
      ports: string[];
      volumes: string[];
    };
    "apache-tika": {
      ports: string[];
    };
  };
  volumes: Record<string, null>;
}

const VOLUME_KEYS = ["pgsql", "qdrant-primary", "qdrant-secondary", "elasticsearch"] as const;
type VolumeKey = (typeof VOLUME_KEYS)[number];

// Volume name as declared in docker-compose.override.yml
function getComposeVolumeName(envName: string, volume: VolumeKey): string {
  return `dust-hive-${envName}-${volume}`;
}

// Actual Docker volume name (Docker Compose prefixes with project name)
function getDockerVolumeName(envName: string, volume: VolumeKey): string {
  const projectName = getDockerProjectName(envName);
  const composeVolumeName = getComposeVolumeName(envName, volume);
  return `${projectName}_${composeVolumeName}`;
}

// Get list of volume names for an environment (as declared in docker-compose)
export function getVolumeNames(name: string): string[] {
  return VOLUME_KEYS.map((volume) => getComposeVolumeName(name, volume));
}

// Generate docker-compose.override.yml content for an environment
export function generateDockerComposeOverride(
  name: string,
  ports: PortAllocation
): DockerComposeOverride {
  return {
    services: {
      db: {
        ports: [`${ports.postgres}:5432`],
        volumes: [`${getComposeVolumeName(name, "pgsql")}:/var/lib/postgresql/data`],
      },
      redis: {
        ports: [`${ports.redis}:6379`],
      },
      qdrant_primary: {
        ports: [`${ports.qdrantHttp}:6333`, `${ports.qdrantGrpc}:6334`],
        volumes: [`${getComposeVolumeName(name, "qdrant-primary")}:/qdrant/storage`],
      },
      qdrant_secondary: {
        volumes: [`${getComposeVolumeName(name, "qdrant-secondary")}:/qdrant/storage`],
      },
      elasticsearch: {
        ports: [`${ports.elasticsearch}:9200`],
        volumes: [`${getComposeVolumeName(name, "elasticsearch")}:/usr/share/elasticsearch/data`],
      },
      "apache-tika": {
        ports: [`${ports.apacheTika}:9998`],
      },
    },
    volumes: Object.fromEntries(getVolumeNames(name).map((volume) => [volume, null] as const)),
  };
}

// Write docker-compose.override.yml file for an environment
export async function writeDockerComposeOverride(
  name: string,
  ports: PortAllocation
): Promise<void> {
  const override = generateDockerComposeOverride(name, ports);
  const content = YAML.stringify(override);
  const path = getDockerOverridePath(name);
  await Bun.write(path, content);
}

// Get docker project name for an environment
export function getDockerProjectName(name: string): string {
  return `dust-hive-${name}`;
}

// Start docker-compose containers (starts in background, services have retry logic)
export async function startDocker(env: Environment): Promise<void> {
  logger.step("Starting Docker containers...");

  const projectName = getDockerProjectName(env.name);
  const overridePath = getDockerOverridePath(env.name);
  const basePath = getDockerComposePath();

  // Start all containers in detached mode (no --wait)
  const proc = Bun.spawn(
    ["docker", "compose", "-f", basePath, "-f", overridePath, "-p", projectName, "up", "-d"],
    { stdout: "pipe", stderr: "pipe" }
  );

  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  if (proc.exitCode !== 0) {
    throw new Error(`Docker compose failed: ${stderr}`);
  }

  // Don't wait for containers to be healthy - services have retry logic
  // This allows services to start connecting while containers finish starting
  logger.success("Docker containers started");
}

// Pause docker-compose containers (stop without removing)
// Returns true if paused successfully, false if docker-compose failed
// Use this for cool operations - faster restart since containers don't need to be recreated
export async function pauseDocker(envName: string): Promise<boolean> {
  logger.step("Pausing Docker containers...");

  const projectName = getDockerProjectName(envName);
  const overridePath = getDockerOverridePath(envName);
  const basePath = getDockerComposePath();

  const args = ["docker", "compose", "-f", basePath, "-f", overridePath, "-p", projectName, "stop"];

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    logger.success("Docker containers paused");
    return true;
  }

  logger.warn("Docker containers may not have paused cleanly");
  return false;
}

// Stop docker-compose containers (stop and remove)
// Returns true if stopped successfully, false if docker-compose failed
export async function stopDocker(
  envName: string,
  options: { removeVolumes?: boolean } = {}
): Promise<boolean> {
  logger.step("Stopping Docker containers...");

  const projectName = getDockerProjectName(envName);
  const overridePath = getDockerOverridePath(envName);
  const basePath = getDockerComposePath();

  const args = ["docker", "compose", "-f", basePath, "-f", overridePath, "-p", projectName, "down"];

  if (options.removeVolumes) {
    args.push("-v");
  }

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  await proc.exited;

  if (proc.exitCode === 0) {
    const msg = options.removeVolumes
      ? "Docker containers and volumes removed"
      : "Docker containers stopped and removed";
    logger.success(msg);
    return true;
  }

  logger.warn("Docker containers may not have stopped cleanly");
  return false;
}

// Remove docker volumes (fallback if docker-compose down -v didn't work)
// Returns list of volumes that failed to remove (empty array = all succeeded)
export async function removeDockerVolumes(envName: string): Promise<string[]> {
  const volumes = getVolumeNames(envName);
  const failed: string[] = [];

  for (const volume of volumes) {
    const proc = Bun.spawn(["docker", "volume", "rm", "-f", volume], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await proc.exited;
    if (proc.exitCode !== 0) {
      failed.push(volume);
    }
  }

  return failed;
}

// Check if a docker volume exists
async function volumeExists(volumeName: string): Promise<boolean> {
  const proc = Bun.spawn(["docker", "volume", "inspect", volumeName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Check if a docker container is running
export async function isContainerRunning(containerName: string): Promise<boolean> {
  const proc = Bun.spawn(["docker", "inspect", "-f", "{{.State.Running}}", containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return proc.exitCode === 0 && stdout.trim() === "true";
}

// Run a docker command on a container (pause, unpause, etc.)
async function dockerContainerCommand(
  command: "pause" | "unpause",
  containerName: string
): Promise<boolean> {
  const proc = Bun.spawn(["docker", command, containerName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
  return proc.exitCode === 0;
}

// Remove a single docker volume
async function removeVolume(volumeName: string): Promise<void> {
  const proc = Bun.spawn(["docker", "volume", "rm", "-f", volumeName], {
    stdout: "pipe",
    stderr: "pipe",
  });
  await proc.exited;
}

// Remove the postgres volume for an environment
export async function removePostgresVolume(envName: string): Promise<void> {
  await removeVolume(getDockerVolumeName(envName, "pgsql"));
}

// Clone postgres volume from source environment to target environment
export async function clonePostgresVolume(
  sourceEnv: string,
  targetEnv: string
): Promise<Result<void, string>> {
  const sourceVolume = getDockerVolumeName(sourceEnv, "pgsql");
  const targetVolume = getDockerVolumeName(targetEnv, "pgsql");
  const sourceContainer = `${getDockerProjectName(sourceEnv)}-db-1`;

  // Check source volume exists
  if (!(await volumeExists(sourceVolume))) {
    return Err(`Source volume '${sourceVolume}' does not exist`);
  }

  // Check target volume doesn't already exist
  if (await volumeExists(targetVolume)) {
    return Err(`Target volume '${targetVolume}' already exists`);
  }

  // Check if source container is running - if so, pause it during copy
  const wasRunning = await isContainerRunning(sourceContainer);
  if (wasRunning) {
    logger.step(`Pausing ${sourceContainer} during volume copy...`);
    const paused = await dockerContainerCommand("pause", sourceContainer);
    if (!paused) {
      return Err(`Failed to pause container '${sourceContainer}'`);
    }
  }

  try {
    // Create target volume
    logger.step(`Creating volume ${targetVolume}...`);
    const createProc = Bun.spawn(["docker", "volume", "create", targetVolume], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const createStderr = await new Response(createProc.stderr).text();
    await createProc.exited;
    if (createProc.exitCode !== 0) {
      return Err(`Failed to create volume: ${createStderr}`);
    }

    // Copy data using alpine container
    logger.step(`Copying data from ${sourceVolume} to ${targetVolume}...`);
    const copyProc = Bun.spawn(
      [
        "docker",
        "run",
        "--rm",
        "-v",
        `${sourceVolume}:/from:ro`,
        "-v",
        `${targetVolume}:/to`,
        "alpine:3.21",
        "cp",
        "-a",
        "/from/.",
        "/to/",
      ],
      { stdout: "pipe", stderr: "pipe" }
    );
    const copyStderr = await new Response(copyProc.stderr).text();
    await copyProc.exited;
    if (copyProc.exitCode !== 0) {
      // Clean up the created volume on failure
      await removeVolume(targetVolume);
      return Err(`Failed to copy volume data: ${copyStderr}`);
    }

    return Ok(undefined);
  } finally {
    // Always unpause if we paused
    if (wasRunning) {
      logger.step(`Resuming ${sourceContainer}...`);
      await dockerContainerCommand("unpause", sourceContainer);
    }
  }
}
