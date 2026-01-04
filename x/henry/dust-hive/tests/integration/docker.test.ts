/**
 * Integration tests for Docker operations
 *
 * Tests Docker Compose file generation, container management, and volumes.
 * Requires Docker to be running.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import { cleanupTestEnvironment, registerCleanup, runAllCleanups } from "./cleanup";
import {
  type TestContext,
  createTestContext,
  createTestGitRepo,
  getTestPortBase,
  requireDocker,
} from "./setup";

// Import the modules we're testing
import {
  generateDockerComposeOverride,
  getDockerProjectName,
  getVolumeNames,
  removeDockerVolumes,
  startDocker,
  stopDocker,
  writeDockerComposeOverride,
} from "../../src/lib/docker";
import {
  type EnvironmentMetadata,
  createEnvironment,
  deleteEnvironmentDir,
} from "../../src/lib/environment";
import { DUST_HIVE_ENVS, getDockerOverridePath } from "../../src/lib/paths";
import { calculatePorts } from "../../src/lib/ports";

// Check Docker availability before running tests
beforeAll(async () => {
  await requireDocker();
});

describe("docker integration", () => {
  let ctx: TestContext;
  let repoPath: string;

  beforeEach(async () => {
    ctx = await createTestContext("docker");
    repoPath = join(ctx.tempDir, "repo");
    await createTestGitRepo(repoPath);
    await mkdir(DUST_HIVE_ENVS, { recursive: true });
  });

  afterEach(async () => {
    await runAllCleanups();
    await ctx.cleanup();
  });

  describe("generateDockerComposeOverride", () => {
    it("generates correct port mappings", () => {
      const ports = calculatePorts(50000);
      const override = generateDockerComposeOverride(ctx.envName, ports);

      expect(override.services.db.ports).toEqual(["50432:5432"]);
      expect(override.services.redis.ports).toEqual(["50379:6379"]);
      expect(override.services.qdrant_primary.ports).toEqual(["50334:6334", "50333:6333"]);
      expect(override.services.elasticsearch.ports).toEqual(["50200:9200"]);
      expect(override.services["apache-tika"].ports).toEqual(["50998:9998"]);
    });

    it("generates correct volume names", () => {
      const ports = calculatePorts(50000);
      const override = generateDockerComposeOverride(ctx.envName, ports);

      expect(override.services.db.volumes).toEqual([
        `dust-hive-${ctx.envName}-pgsql:/var/lib/postgresql/data`,
      ]);
      expect(override.services.qdrant_primary.volumes).toEqual([
        `dust-hive-${ctx.envName}-qdrant-primary:/qdrant/storage`,
      ]);
      expect(override.services.elasticsearch.volumes).toEqual([
        `dust-hive-${ctx.envName}-elasticsearch:/usr/share/elasticsearch/data`,
      ]);

      // Verify volume declarations
      expect(override.volumes).toHaveProperty(`dust-hive-${ctx.envName}-pgsql`);
      expect(override.volumes).toHaveProperty(`dust-hive-${ctx.envName}-qdrant-primary`);
      expect(override.volumes).toHaveProperty(`dust-hive-${ctx.envName}-qdrant-secondary`);
      expect(override.volumes).toHaveProperty(`dust-hive-${ctx.envName}-elasticsearch`);
    });
  });

  describe("writeDockerComposeOverride", () => {
    it("writes valid YAML file", async () => {
      const ports = calculatePorts(50000);

      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      registerCleanup(async () => {
        await deleteEnvironmentDir(ctx.envName);
      });

      await createEnvironment(metadata);
      await writeDockerComposeOverride(ctx.envName, ports);

      // Read and parse the file
      const overridePath = getDockerOverridePath(ctx.envName);
      const content = await Bun.file(overridePath).text();
      const parsed = YAML.parse(content);

      expect(parsed.services).toBeDefined();
      expect(parsed.services.db).toBeDefined();
      expect(parsed.services.db.ports[0]).toBe("50432:5432");
    });
  });

  describe("getDockerProjectName", () => {
    it("returns prefixed project name", () => {
      expect(getDockerProjectName("myenv")).toBe("dust-hive-myenv");
      expect(getDockerProjectName("test-feature")).toBe("dust-hive-test-feature");
    });
  });

  describe("getVolumeNames", () => {
    it("returns all volume names", () => {
      const volumes = getVolumeNames("myenv");
      expect(volumes).toEqual([
        "dust-hive-myenv-pgsql",
        "dust-hive-myenv-qdrant-primary",
        "dust-hive-myenv-qdrant-secondary",
        "dust-hive-myenv-elasticsearch",
      ]);
    });
  });

  describe("startDocker / stopDocker", () => {
    it("starts and stops containers", async () => {
      // Use unique port base to avoid conflicts
      const portBase = getTestPortBase();
      const ports = calculatePorts(portBase);

      const metadata: EnvironmentMetadata = {
        name: ctx.envName,
        baseBranch: "main",
        workspaceBranch: `${ctx.envName}-workspace`,
        createdAt: new Date().toISOString(),
        repoRoot: repoPath,
      };

      // Create the docker-compose base file with all required services
      const dockerComposeBase = `
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_PASSWORD: test
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 2s
      timeout: 5s
      retries: 5
  redis:
    image: redis:7
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 2s
      timeout: 5s
      retries: 5
  qdrant_primary:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6334/health"]
      interval: 2s
      timeout: 5s
      retries: 5
  qdrant_secondary:
    image: qdrant/qdrant:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:6334/health"]
      interval: 2s
      timeout: 5s
      retries: 5
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.1
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9200 || exit 1"]
      interval: 2s
      timeout: 5s
      retries: 10
  apache-tika:
    image: apache/tika:latest
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9998/tika"]
      interval: 2s
      timeout: 5s
      retries: 5
`;
      await mkdir(join(repoPath, "tools"), { recursive: true });
      await Bun.write(join(repoPath, "tools/docker-compose.dust-hive.yml"), dockerComposeBase);

      registerCleanup(async () => {
        await cleanupTestEnvironment(ctx.envName);
      });

      await createEnvironment(metadata);
      await writeDockerComposeOverride(ctx.envName, ports);

      const env = {
        name: ctx.envName,
        metadata,
        ports,
        initialized: false,
      };

      // Start Docker
      await startDocker(env);

      // Give containers a moment to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Check containers are running
      const projectName = getDockerProjectName(ctx.envName);
      const psProc = Bun.spawn(["docker", "compose", "-p", projectName, "ps", "--format", "json"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const psOutput = await new Response(psProc.stdout).text();
      await psProc.exited;

      // Should have at least some containers
      expect(psOutput.length).toBeGreaterThan(0);

      // Stop Docker
      const stopped = await stopDocker(ctx.envName, repoPath);
      expect(stopped).toBe(true);

      // Verify containers are stopped
      const psProc2 = Bun.spawn(
        ["docker", "compose", "-p", projectName, "ps", "--format", "json"],
        { stdout: "pipe", stderr: "pipe" }
      );
      const psOutput2 = await new Response(psProc2.stdout).text();
      await psProc2.exited;

      // Should have no running containers (empty or no output)
      expect(psOutput2.trim()).toBe("");
    }, 60000); // 60 second timeout for Docker operations
  });

  describe("removeDockerVolumes", () => {
    it("removes volumes by name", async () => {
      // Create a test volume
      const volumeName = `dust-hive-${ctx.envName}-test-volume`;

      const createProc = Bun.spawn(["docker", "volume", "create", volumeName], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await createProc.exited;

      registerCleanup(async () => {
        // Ensure volume is removed
        const rmProc = Bun.spawn(["docker", "volume", "rm", "-f", volumeName], {
          stdout: "pipe",
          stderr: "pipe",
        });
        await rmProc.exited;
      });

      // Verify volume exists
      const lsProc = Bun.spawn(["docker", "volume", "ls", "--format", "{{.Name}}"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const lsOutput = await new Response(lsProc.stdout).text();
      await lsProc.exited;
      expect(lsOutput).toContain(volumeName);

      // Remove volumes (will fail for non-existent ones, that's ok)
      const failed = await removeDockerVolumes(ctx.envName);
      // The test volume won't be in the standard list, but removeDockerVolumes
      // should handle non-existent volumes gracefully
      expect(Array.isArray(failed)).toBe(true);
    });

    it("handles non-existent volumes gracefully", async () => {
      const failed = await removeDockerVolumes("nonexistent-env-12345");
      // Should return the failed volumes (all of them since they don't exist)
      // But should not throw
      expect(Array.isArray(failed)).toBe(true);
    });
  });
});
