/**
 * Northflank Sandbox Script
 *
 * Demonstrates the complete lifecycle of a sandbox VM:
 * - Authentication
 * - Cluster discovery
 * - VM creation with base image
 * - Command execution with streaming output
 * - File upload/download
 * - Cleanup
 *
 * Usage:
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts
 *
 * Or with options:
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts --discover
 *   NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts --cluster-id=my-cluster
 */

import {
  ApiClient,
  ApiClientInMemoryContextProvider,
} from "@northflank/js-client";
import * as fs from "fs";
import * as path from "path";

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Base image for sandbox VMs
  baseImage: "ubuntu:22.04",

  // Compute plan (nf-compute-20 is smallest: 0.2 vCPU)
  // See: https://northflank.com/pricing
  deploymentPlan: "nf-compute-20",

  // Your BYOC cluster ID (run with --discover to list available clusters)
  // Leave empty to use default Northflank region
  clusterId: "", // e.g., "my-gcp-cluster"

  // Fallback region if no cluster specified
  // Your cluster: northflank-dev-kube in us-central1
  defaultRegion: "us-central1",

  // Project naming
  projectPrefix: "sandbox",

  // Use an existing project instead of creating new ones
  // Set to empty string to create new projects
  existingProjectId: "dust-sandbox-dev",

  // Tag for spot node scheduling (required for your cluster)
  spotTag: "spot-workload",

  // Timeouts
  serviceReadyTimeoutMs: 120000, // 2 minutes
  pollIntervalMs: 3000,
};

// ============================================================================
// TYPES
// ============================================================================

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

// ============================================================================
// MAIN SANDBOX CLASS
// ============================================================================

class NorthflankSandbox {
  private api: ApiClient;
  private projectId: string | null = null;
  private serviceId: string | null = null;
  private initPromise: Promise<void>;

  constructor(apiToken: string) {
    const contextProvider = new ApiClientInMemoryContextProvider();
    // We'll initialize async
    this.api = null as unknown as ApiClient;
    this.initPromise = this.init(contextProvider, apiToken);
  }

  private async init(
    contextProvider: ApiClientInMemoryContextProvider,
    apiToken: string
  ): Promise<void> {
    await contextProvider.addContext({
      name: "default",
      token: apiToken,
    });
    this.api = new ApiClient(contextProvider);
  }

  private async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  // --------------------------------------------------------------------------
  // Discovery
  // --------------------------------------------------------------------------

  /**
   * List available clusters (useful for BYOC setups)
   */
  async listClusters(): Promise<
    Array<{ id: string; name: string; region: string; status: string }>
  > {
    await this.ensureReady();

    const response = await this.api.list.cloud.clusters({});
    const result: Array<{
      id: string;
      name: string;
      region: string;
      status: string;
    }> = [];
    for (const c of response.data.clusters) {
      // Status can be a string or an object with a state property
      const statusValue = c.status as
        | string
        | { state: string }
        | undefined;
      let status: string;
      if (typeof statusValue === "string") {
        status = statusValue;
      } else if (statusValue && typeof statusValue === "object") {
        status = statusValue.state || "unknown";
      } else {
        status = "unknown";
      }
      result.push({
        id: c.id,
        name: c.name,
        region: c.region,
        status,
      });
    }
    return result;
  }

  /**
   * List available regions
   */
  async listRegions(): Promise<Array<{ id: string; name: string }>> {
    await this.ensureReady();

    const response = await this.api.list.cloud.regions({});
    // The API returns providers array, each with regions info
    return response.data.providers.map((p) => ({
      id: p.id,
      name: p.name,
    }));
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a new sandbox VM
   * Returns timing information about the startup process
   */
  async create(options?: { clusterId?: string; name?: string }): Promise<{ startupTimeMs: number }> {
    await this.ensureReady();

    const createStartTime = Date.now();
    const timestamp = createStartTime;
    const serviceName = `vm-${timestamp}`;

    // Use existing project or create new one
    if (CONFIG.existingProjectId) {
      this.projectId = CONFIG.existingProjectId;
      console.log(`[sandbox] Using existing project: ${this.projectId}`);
    } else {
      const projectName =
        options?.name || `${CONFIG.projectPrefix}-${timestamp}`;

      console.log(`[sandbox] Creating project: ${projectName}`);

      const projectData: {
        name: string;
        description: string;
        region: string;
      } = {
        name: projectName,
        description: "Sandbox VM project",
        region: CONFIG.defaultRegion,
      };

      const projectResponse = await this.api.create.project({
        data: projectData,
      });

      if (projectResponse.error) {
        throw new Error(
          `Failed to create project: ${projectResponse.error.message}`
        );
      }

      this.projectId = projectResponse.data.id;
      console.log(`[sandbox] Project created: ${this.projectId}`);
    }

    // Create deployment service
    console.log(`[sandbox] Creating service: ${serviceName}`);
    console.log(`[sandbox] Image: ${CONFIG.baseImage}`);
    console.log(`[sandbox] Plan: ${CONFIG.deploymentPlan}`);

    const serviceResponse = await this.api.create.service.deployment({
      parameters: { projectId: this.projectId },
      data: {
        name: serviceName,
        // Tag for spot node scheduling
        tags: CONFIG.spotTag ? [CONFIG.spotTag] : undefined,
        billing: {
          deploymentPlan: CONFIG.deploymentPlan,
        },
        deployment: {
          instances: 1,
          external: {
            imagePath: CONFIG.baseImage,
          },
          // Keep the container running with a sleep command
          // This allows us to exec into it
          docker: {
            configType: "customCommand",
            customCommand: "sleep infinity",
          },
        },
        runtimeEnvironment: {},
      },
    });

    if (serviceResponse.error) {
      throw new Error(
        `Failed to create service: ${serviceResponse.error.message}`
      );
    }

    this.serviceId = serviceResponse.data.id;
    console.log(`[sandbox] Service created: ${this.serviceId}`);

    // Wait for service to be ready
    await this.waitForReady();

    const startupTimeMs = Date.now() - createStartTime;
    console.log(`[sandbox] Total startup time: ${(startupTimeMs / 1000).toFixed(1)}s`);
    return { startupTimeMs };
  }

  /**
   * Wait for the service to be in running state
   */
  private async waitForReady(): Promise<void> {
    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Waiting for service to be ready...`);

    const startTime = Date.now();
    while (Date.now() - startTime < CONFIG.serviceReadyTimeoutMs) {
      const response = await this.api.get.service({
        parameters: { projectId: this.projectId, serviceId: this.serviceId },
      });

      const deploymentStatus = response.data.status?.deployment?.status;
      const buildStatus = response.data.status?.build?.status;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(
        `[sandbox] Status: deployment=${deploymentStatus || "N/A"}, build=${buildStatus || "N/A"} (${elapsed}s)`
      );

      // For deployment services, we check deployment status
      if (deploymentStatus === "COMPLETED") {
        console.log(`[sandbox] Service is ready!`);
        return;
      }

      if (deploymentStatus === "FAILED") {
        throw new Error(`Service deployment failed`);
      }

      if (buildStatus === "FAILURE" || buildStatus === "CRASHED") {
        throw new Error(`Service build failed: ${buildStatus}`);
      }

      await sleep(CONFIG.pollIntervalMs);
    }

    throw new Error(
      `Service did not become ready within ${CONFIG.serviceReadyTimeoutMs}ms`
    );
  }

  // --------------------------------------------------------------------------
  // Command Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a command and return the result
   */
  async exec(command: string | string[]): Promise<CommandResult> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    // If command is a string, wrap it with bash -c
    // If command is an array, pass it directly without shell
    const isString = typeof command === "string";
    const cmdArray = isString ? ["bash", "-c", command] : command;
    console.log(`[sandbox] Executing: ${isString ? command : cmdArray.join(" ")}`);

    const result = await this.api.exec.execServiceCommand(
      { projectId: this.projectId, serviceId: this.serviceId },
      {
        command: cmdArray,
        shell: "none",
      }
    );

    return {
      exitCode: result.commandResult.exitCode,
      stdout: result.stdOut,
      stderr: result.stdErr,
    };
  }

  /**
   * Execute a command with real-time streaming output
   */
  async execStreaming(
    command: string,
    onStdout?: (data: string) => void,
    onStderr?: (data: string) => void
  ): Promise<number> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Executing (streaming): ${command}`);

    return new Promise((resolve, reject) => {
      this.api.exec
        .execServiceSession(
          { projectId: this.projectId!, serviceId: this.serviceId! },
          {
            // Wrap command with bash -c
            command: ["bash", "-c", command],
            shell: "none",
            tty: false,
          }
        )
        .then((session) => {
          let exitCode = 0;

          session.stdOut.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            if (onStdout) {
              onStdout(text);
            } else {
              process.stdout.write(text);
            }
          });

          session.stdErr.on("data", (chunk: Buffer) => {
            const text = chunk.toString();
            if (onStderr) {
              onStderr(text);
            } else {
              process.stderr.write(text);
            }
          });

          session.on("command-result", (result: { exitCode: number }) => {
            exitCode = result.exitCode;
          });

          session.on("command-completed", () => {
            resolve(exitCode);
          });

          session.on("error", (err: Error) => {
            reject(err);
          });
        })
        .catch(reject);
    });
  }

  // --------------------------------------------------------------------------
  // File Transfer
  // --------------------------------------------------------------------------

  /**
   * Upload a file to the sandbox
   */
  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Uploading: ${localPath} -> ${remotePath}`);

    // Read the local file
    const content = fs.readFileSync(localPath);

    await this.api.fileCopy.uploadServiceFileStream(
      { projectId: this.projectId, serviceId: this.serviceId },
      {
        source: content,
        remotePath: remotePath,
      }
    );

    console.log(`[sandbox] Upload complete`);
  }

  /**
   * Upload content directly to the sandbox
   */
  async uploadContent(
    content: string | Buffer,
    remotePath: string
  ): Promise<void> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Uploading content to: ${remotePath}`);

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    await this.api.fileCopy.uploadServiceFileStream(
      { projectId: this.projectId, serviceId: this.serviceId },
      {
        source: buffer,
        remotePath: remotePath,
      }
    );

    console.log(`[sandbox] Upload complete`);
  }

  /**
   * Download a file from the sandbox
   */
  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Downloading: ${remotePath} -> ${localPath}`);

    const { fileStream, completionPromise } =
      await this.api.fileCopy.downloadServiceFileStream(
        { projectId: this.projectId, serviceId: this.serviceId },
        { remotePath: remotePath }
      );

    // Ensure the directory exists
    const dir = path.dirname(localPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Pipe to local file
    const writeStream = fs.createWriteStream(localPath);
    fileStream.pipe(writeStream);

    await completionPromise;
    console.log(`[sandbox] Download complete`);
  }

  /**
   * Download a file and return its content
   */
  async downloadContent(remotePath: string): Promise<Buffer> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Downloading content from: ${remotePath}`);

    const { fileStream, completionPromise } =
      await this.api.fileCopy.downloadServiceFileStream(
        { projectId: this.projectId, serviceId: this.serviceId },
        { remotePath: remotePath }
      );

    const chunks: Buffer[] = [];
    fileStream.on("data", (chunk: Buffer) => chunks.push(chunk));

    await completionPromise;
    return Buffer.concat(chunks);
  }

  // --------------------------------------------------------------------------
  // Logs
  // --------------------------------------------------------------------------

  /**
   * Stream logs from the sandbox
   */
  async streamLogs(
    onLog: (line: { timestamp: Date; message: string }) => void,
    options?: { durationMs?: number }
  ): Promise<void> {
    await this.ensureReady();

    if (!this.projectId || !this.serviceId) {
      throw new Error("Sandbox not created");
    }

    console.log(`[sandbox] Starting log stream...`);

    const logsClient = await this.api.logs.tailServiceLogs({
      parameters: { projectId: this.projectId, serviceId: this.serviceId },
      options: {
        startTime: new Date(),
      },
    });

    logsClient.on(
      "logs-received",
      (lines: Array<{ ts: string | Date; log: string }>) => {
        lines.forEach((line) => {
          onLog({
            timestamp: new Date(line.ts),
            message: line.log,
          });
        });
      }
    );

    logsClient.on("error", (err: Error) => {
      console.error(`[sandbox] Log stream error:`, err);
    });

    await logsClient.start();

    if (options?.durationMs) {
      await sleep(options.durationMs);
      await logsClient.stop();
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Shutdown and cleanup the sandbox
   */
  async destroy(): Promise<void> {
    await this.ensureReady();

    if (!this.projectId) {
      console.log(`[sandbox] Nothing to cleanup`);
      return;
    }

    console.log(`[sandbox] Cleaning up...`);

    // Delete the service
    if (this.serviceId) {
      try {
        await this.api.delete.service({
          parameters: { projectId: this.projectId, serviceId: this.serviceId },
        });
        console.log(`[sandbox] Service deleted`);
      } catch (err) {
        console.warn(`[sandbox] Failed to delete service:`, err);
      }
    }

    // Only delete the project if we created it (not using existing)
    if (!CONFIG.existingProjectId) {
      try {
        await this.api.delete.project({
          parameters: { projectId: this.projectId },
        });
        console.log(`[sandbox] Project deleted`);
      } catch (err) {
        console.error(`[sandbox] Failed to delete project:`, err);
        throw err;
      }
    }

    this.projectId = null;
    this.serviceId = null;
    console.log(`[sandbox] Cleanup complete`);
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getProjectId(): string | null {
    return this.projectId;
  }

  getServiceId(): string | null {
    return this.serviceId;
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiToken(): string {
  const token = process.env.NORTHFLANK_API_TOKEN;
  if (!token) {
    console.error("Error: NORTHFLANK_API_TOKEN environment variable not set");
    console.error("");
    console.error("To get an API token:");
    console.error("  1. Go to Northflank Team Settings -> API");
    console.error("  2. Create an API Role with required permissions");
    console.error("  3. Generate a token with that role");
    console.error("");
    console.error("Then run:");
    console.error("  NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts");
    process.exit(1);
  }
  return token;
}

// ============================================================================
// DEMO FUNCTIONS
// ============================================================================

/**
 * Discovery mode: list available clusters and regions
 */
async function discoverClusters(): Promise<void> {
  const token = getApiToken();
  const sandbox = new NorthflankSandbox(token);

  console.log("\n=== Available Clusters ===\n");

  const clusters = await sandbox.listClusters();
  if (clusters.length === 0) {
    console.log("No BYOC clusters found. You can use default regions instead.");
  } else {
    clusters.forEach((c) => {
      console.log(`  ID: ${c.id}`);
      console.log(`  Name: ${c.name}`);
      console.log(`  Region: ${c.region}`);
      console.log(`  Status: ${c.status}`);
      console.log("");
    });
  }

  console.log("\n=== Available Regions ===\n");

  const regions = await sandbox.listRegions();
  regions.forEach((r) => {
    console.log(`  ${r.id}: ${r.name}`);
  });

  console.log("\n");
  console.log("To use a specific cluster, set CONFIG.clusterId in the script.");
  console.log("To use a region, set CONFIG.defaultRegion in the script.");
}

/**
 * Main demo: full sandbox lifecycle using pre-warmed pool
 */
async function runDemo(): Promise<void> {
  const token = getApiToken();

  // Create pool with 1 sandbox for the demo
  const pool = new SandboxPool({
    size: 1,
    apiToken: token,
  });

  let sandbox: NorthflankSandbox | null = null;

  try {
    // ========================================================================
    // 1. Warm up the pool
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 1: Warm up sandbox pool");
    console.log("=".repeat(60) + "\n");

    await pool.warmUp();

    // ========================================================================
    // 2. Acquire sandbox from pool (instant!)
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 2: Acquire sandbox from pool");
    console.log("=".repeat(60) + "\n");

    const acquireStart = Date.now();
    sandbox = await pool.acquire();
    const acquireTime = Date.now() - acquireStart;
    console.log(`\n>>> Sandbox acquired in ${acquireTime}ms <<<\n`);

    // ========================================================================
    // 3. Execute a simple command
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 3: Execute command (simple)");
    console.log("=".repeat(60) + "\n");

    const result = await sandbox.exec("echo 'Hello from sandbox!' && uname -a");
    console.log(`Exit code: ${result.exitCode}`);
    console.log(`stdout: ${result.stdout}`);
    if (result.stderr) console.log(`stderr: ${result.stderr}`);

    // ========================================================================
    // 4. Execute with streaming output
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 4: Execute command (streaming)");
    console.log("=".repeat(60) + "\n");

    console.log("--- Streaming output start ---");
    const exitCode = await sandbox.execStreaming(
      "for i in 1 2 3 4 5; do echo \"Line $i\"; sleep 0.5; done"
    );
    console.log("--- Streaming output end ---");
    console.log(`Exit code: ${exitCode}`);

    // ========================================================================
    // 5. Upload a file
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 5: Upload file");
    console.log("=".repeat(60) + "\n");

    const testContent = `#!/bin/bash
# Test script uploaded to sandbox
echo "This script was uploaded from the host!"
echo "Current time: $(date)"
echo "Hostname: $(hostname)"
ls -la /tmp/
`;

    await sandbox.uploadContent(testContent, "/tmp/test-script.sh");

    // Verify the upload
    const verifyResult = await sandbox.exec("cat /tmp/test-script.sh");
    console.log("Uploaded file content:");
    console.log(verifyResult.stdout);

    // ========================================================================
    // 6. Execute the uploaded script
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 6: Execute uploaded script");
    console.log("=".repeat(60) + "\n");

    await sandbox.exec("chmod +x /tmp/test-script.sh");
    const scriptResult = await sandbox.exec("/tmp/test-script.sh");
    console.log(scriptResult.stdout);

    // ========================================================================
    // 7. Create and download a file
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 7: Download file");
    console.log("=".repeat(60) + "\n");

    // Create a file in the sandbox
    await sandbox.exec(
      'echo "Generated in sandbox at $(date)" > /tmp/output.txt'
    );

    // Download it
    const downloadedContent = await sandbox.downloadContent("/tmp/output.txt");
    console.log("Downloaded content:");
    console.log(downloadedContent.toString());

    // ========================================================================
    // 8. Release sandbox and shutdown pool
    // ========================================================================
    console.log("\n" + "=".repeat(60));
    console.log("STEP 8: Cleanup");
    console.log("=".repeat(60) + "\n");

    await pool.release(sandbox);
    sandbox = null;
    await pool.shutdown();

    console.log("\n" + "=".repeat(60));
    console.log("DEMO COMPLETE!");
    console.log("=".repeat(60) + "\n");
  } catch (err) {
    console.error("\nError:", err);

    // Always try to cleanup on error
    console.log("\nAttempting cleanup...");
    try {
      if (sandbox) {
        await pool.release(sandbox);
      }
      await pool.shutdown();
    } catch (cleanupErr) {
      console.error("Cleanup also failed:", cleanupErr);
    }

    process.exit(1);
  }
}

// ============================================================================
// PRE-WARMED POOL
// ============================================================================

interface PoolConfig {
  size: number;           // Number of warm sandboxes to maintain
  apiToken: string;       // Northflank API token
}

class SandboxPool {
  private config: PoolConfig;
  private ready: NorthflankSandbox[] = [];
  private warming: Promise<NorthflankSandbox>[] = [];
  private isShuttingDown = false;

  constructor(config: PoolConfig) {
    this.config = config;
  }

  /**
   * Initialize the pool with warm sandboxes
   */
  async warmUp(): Promise<void> {
    console.log(`[pool] Warming up ${this.config.size} sandboxes...`);
    const warmStart = Date.now();

    // Start all sandboxes in parallel
    const promises = Array.from({ length: this.config.size }, (_, i) =>
      this.createWarmSandbox(i + 1)
    );

    const sandboxes = await Promise.all(promises);
    this.ready.push(...sandboxes);

    const warmupTime = ((Date.now() - warmStart) / 1000).toFixed(1);
    console.log(`[pool] Pool ready: ${this.ready.length} sandboxes warmed in ${warmupTime}s`);
  }

  private async createWarmSandbox(index?: number): Promise<NorthflankSandbox> {
    const label = index ? `#${index}` : "#new";
    console.log(`[pool] Creating sandbox ${label}...`);

    const sandbox = new NorthflankSandbox(this.config.apiToken);
    const { startupTimeMs } = await sandbox.create();

    console.log(`[pool] Sandbox ${label} ready (${(startupTimeMs / 1000).toFixed(1)}s)`);
    return sandbox;
  }

  /**
   * Acquire a sandbox from the pool (instant if pool has capacity)
   */
  async acquire(): Promise<NorthflankSandbox> {
    if (this.isShuttingDown) {
      throw new Error("Pool is shutting down");
    }

    const acquireStart = Date.now();

    // Try to get a ready sandbox
    const sandbox = this.ready.shift();

    if (sandbox) {
      console.log(`[pool] Acquired sandbox (instant) - ${this.ready.length} remaining`);

      // Replenish the pool in background
      this.replenish();

      return sandbox;
    }

    // No ready sandbox - wait for one being warmed, or create new
    if (this.warming.length > 0) {
      console.log(`[pool] Waiting for sandbox being warmed...`);
      const warmingSandbox = this.warming.shift()!;
      const result = await warmingSandbox;

      const waitTime = ((Date.now() - acquireStart) / 1000).toFixed(1);
      console.log(`[pool] Acquired sandbox (waited ${waitTime}s)`);

      this.replenish();
      return result;
    }

    // Nothing available - create on demand (cold start)
    console.log(`[pool] Pool empty! Cold start required...`);
    const newSandbox = await this.createWarmSandbox();

    const coldTime = ((Date.now() - acquireStart) / 1000).toFixed(1);
    console.log(`[pool] Acquired sandbox (cold start ${coldTime}s)`);

    this.replenish();
    return newSandbox;
  }

  /**
   * Release a sandbox back (destroys it and replenishes pool)
   */
  async release(sandbox: NorthflankSandbox): Promise<void> {
    console.log(`[pool] Releasing sandbox ${sandbox.getServiceId()}`);

    // Destroy the used sandbox (don't reuse for security)
    try {
      await sandbox.destroy();
    } catch (err) {
      console.warn(`[pool] Failed to destroy sandbox:`, err);
    }

    // Replenish is already triggered on acquire, but ensure pool stays full
    this.replenish();
  }

  /**
   * Replenish the pool to maintain target size
   */
  private replenish(): void {
    if (this.isShuttingDown) return;

    const total = this.ready.length + this.warming.length;
    const needed = this.config.size - total;

    if (needed > 0) {
      console.log(`[pool] Replenishing: ${needed} sandbox(es) needed`);

      for (let i = 0; i < needed; i++) {
        const promise = this.createWarmSandbox().then((sandbox) => {
          // Move from warming to ready when done
          const idx = this.warming.indexOf(promise);
          if (idx !== -1) this.warming.splice(idx, 1);

          if (!this.isShuttingDown) {
            this.ready.push(sandbox);
            console.log(`[pool] Sandbox added to pool - ${this.ready.length} ready`);
          } else {
            // Pool is shutting down, destroy this sandbox
            sandbox.destroy().catch(() => {});
          }

          return sandbox;
        });

        this.warming.push(promise);
      }
    }
  }

  /**
   * Get pool status
   */
  status(): { ready: number; warming: number; target: number } {
    return {
      ready: this.ready.length,
      warming: this.warming.length,
      target: this.config.size,
    };
  }

  /**
   * Shutdown the pool and destroy all sandboxes
   */
  async shutdown(): Promise<void> {
    console.log(`[pool] Shutting down...`);
    this.isShuttingDown = true;

    // Wait for warming sandboxes to complete
    if (this.warming.length > 0) {
      console.log(`[pool] Waiting for ${this.warming.length} warming sandboxes...`);
      const warmingSandboxes = await Promise.allSettled(this.warming);
      for (const result of warmingSandboxes) {
        if (result.status === "fulfilled") {
          this.ready.push(result.value);
        }
      }
      this.warming = [];
    }

    // Destroy all ready sandboxes
    console.log(`[pool] Destroying ${this.ready.length} sandboxes...`);
    await Promise.allSettled(
      this.ready.map((sandbox) => sandbox.destroy())
    );
    this.ready = [];

    console.log(`[pool] Shutdown complete`);
  }
}

/**
 * Demo: Pre-warmed pool
 */
async function runPoolDemo(): Promise<void> {
  const token = getApiToken();

  // Create pool with 2 warm sandboxes
  const pool = new SandboxPool({
    size: 2,
    apiToken: token,
  });

  try {
    // Warm up the pool (this takes ~40s but happens once at startup)
    await pool.warmUp();

    console.log("\n" + "=".repeat(60));
    console.log("POOL DEMO: Acquire sandboxes instantly");
    console.log("=".repeat(60) + "\n");

    // Acquire first sandbox - should be instant
    console.log("\n--- Acquiring sandbox 1 ---");
    let start = Date.now();
    const sandbox1 = await pool.acquire();
    console.log(`Acquired in ${Date.now() - start}ms`);

    // Run a command
    const result = await sandbox1.exec("echo 'Hello from pooled sandbox!'");
    console.log(`Output: ${result.stdout}`);

    // Acquire second sandbox - should also be instant
    console.log("\n--- Acquiring sandbox 2 ---");
    start = Date.now();
    const sandbox2 = await pool.acquire();
    console.log(`Acquired in ${Date.now() - start}ms`);

    const result2 = await sandbox2.exec("hostname");
    console.log(`Output: ${result2.stdout}`);

    // Acquire third sandbox - pool is empty, might wait for replenish
    console.log("\n--- Acquiring sandbox 3 (pool exhausted) ---");
    start = Date.now();
    const sandbox3 = await pool.acquire();
    console.log(`Acquired in ${Date.now() - start}ms`);

    // Release all
    console.log("\n--- Releasing sandboxes ---");
    await Promise.all([
      pool.release(sandbox1),
      pool.release(sandbox2),
      pool.release(sandbox3),
    ]);

    // Check status
    console.log("\nPool status:", pool.status());

    // Give replenishment a moment
    console.log("\nWaiting for pool to replenish...");
    await sleep(5000);
    console.log("Pool status:", pool.status());

  } finally {
    // Cleanup
    await pool.shutdown();
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
Northflank Sandbox Demo

Usage:
  NORTHFLANK_API_TOKEN=<token> npx ts-node src/sandbox.ts [options]

Options:
  --discover    List available clusters and regions
  --pool        Run the pre-warmed pool demo
  --help, -h    Show this help message

Environment:
  NORTHFLANK_API_TOKEN    Required. Your Northflank API token.

Configuration:
  Edit the CONFIG object at the top of sandbox.ts to customize:
  - baseImage: Docker image for sandbox (default: ubuntu:22.04)
  - deploymentPlan: Compute plan (default: nf-compute-20)
  - clusterId: Your BYOC cluster ID (optional)
  - defaultRegion: Fallback region (default: us-central1)
`);
    return;
  }

  if (args.includes("--discover")) {
    await discoverClusters();
    return;
  }

  if (args.includes("--pool")) {
    await runPoolDemo();
    return;
  }

  await runDemo();
}

// Export for use as a module
export { NorthflankSandbox, SandboxPool, CONFIG };

// Run if executed directly
main().catch(console.error);
