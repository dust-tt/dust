/**
 * Northflank Sandbox Client
 *
 * Wraps the Northflank JS SDK to provide sandbox lifecycle management.
 * This is adapted from the exploration work in northflank-sdk-analysis.
 */

import {
  ApiClient,
  ApiClientInMemoryContextProvider,
} from "@northflank/js-client";

import config from "@app/lib/api/config";
import logger from "@app/logger/logger";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface SandboxConfig {
  // Base image for sandbox VMs
  baseImage: string;
  // Compute plan (nf-compute-20 is smallest: 0.2 vCPU)
  deploymentPlan: string;
  // Project ID to use for sandboxes
  projectId: string;
  // Tag for spot node scheduling (required for spot-only clusters)
  spotTag: string;
  // Timeouts
  serviceReadyTimeoutMs: number;
  pollIntervalMs: number;
}

const DEFAULT_CONFIG: SandboxConfig = {
  baseImage: "ubuntu:22.04",
  deploymentPlan: "nf-compute-20",
  projectId: "dust-sandbox-dev",
  spotTag: "spot-workload",
  serviceReadyTimeoutMs: 120000,
  pollIntervalMs: 3000,
};

// ============================================================================
// TYPES
// ============================================================================

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxInfo {
  serviceId: string;
  projectId: string;
  createdAt: Date;
}

// ============================================================================
// SANDBOX CLIENT
// ============================================================================

export class NorthflankSandboxClient {
  private api: ApiClient;
  private config: SandboxConfig;
  private serviceId: string | null = null;
  private createdAt: Date | null = null;
  private initPromise: Promise<void>;

  constructor(apiToken: string, configOverrides?: Partial<SandboxConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...configOverrides };
    const contextProvider = new ApiClientInMemoryContextProvider();
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
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Create a new sandbox VM
   */
  async create(): Promise<SandboxInfo> {
    await this.ensureReady();

    const timestamp = Date.now();
    const serviceName = `sandbox-${timestamp}`;

    logger.info(
      { serviceName, image: this.config.baseImage },
      "[sandbox] Creating service"
    );

    const serviceResponse = await this.api.create.service.deployment({
      parameters: { projectId: this.config.projectId },
      data: {
        name: serviceName,
        tags: [
          "dust-sandbox-pool",
          ...(this.config.spotTag ? [this.config.spotTag] : []),
        ],
        billing: {
          deploymentPlan: this.config.deploymentPlan,
        },
        deployment: {
          instances: 1,
          external: {
            imagePath: this.config.baseImage,
          },
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
        `Failed to create sandbox: ${serviceResponse.error.message}`
      );
    }

    const serviceId = serviceResponse.data.id;
    const createdAt = new Date();

    this.serviceId = serviceId;
    this.createdAt = createdAt;

    logger.info({ serviceId }, "[sandbox] Service created");

    await this.waitForReady();

    return {
      serviceId,
      projectId: this.config.projectId,
      createdAt,
    };
  }

  /**
   * Attach to an existing sandbox (for acquiring from pool)
   */
  attach(info: SandboxInfo): void {
    this.serviceId = info.serviceId;
    this.createdAt = info.createdAt;
  }

  /**
   * Wait for the service to be ready
   */
  private async waitForReady(): Promise<void> {
    if (!this.serviceId) {
      throw new Error("Sandbox not created");
    }

    logger.info({ serviceId: this.serviceId }, "[sandbox] Waiting for ready");

    const startTime = Date.now();
    while (Date.now() - startTime < this.config.serviceReadyTimeoutMs) {
      const response = await this.api.get.service({
        parameters: {
          projectId: this.config.projectId,
          serviceId: this.serviceId,
        },
      });

      const deploymentStatus = response.data.status?.deployment?.status;

      if (deploymentStatus === "COMPLETED") {
        logger.info({ serviceId: this.serviceId }, "[sandbox] Service ready");
        return;
      }

      if (deploymentStatus === "FAILED") {
        throw new Error("Sandbox deployment failed");
      }

      await sleep(this.config.pollIntervalMs);
    }

    throw new Error(
      `Sandbox did not become ready within ${this.config.serviceReadyTimeoutMs}ms`
    );
  }

  // --------------------------------------------------------------------------
  // Command Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a command and return the result
   */
  async exec(
    command: string,
    _options?: { workingDirectory?: string; timeoutMs?: number }
  ): Promise<CommandResult> {
    await this.ensureReady();

    if (!this.serviceId) {
      throw new Error("Sandbox not created or attached");
    }

    const cmdArray = ["bash", "-c", command];

    logger.info(
      { serviceId: this.serviceId, command },
      "[sandbox] Executing command"
    );

    const result = await this.api.exec.execServiceCommand(
      { projectId: this.config.projectId, serviceId: this.serviceId },
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

  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------

  /**
   * Write content to a file in the sandbox
   */
  async writeFile(remotePath: string, content: string | Buffer): Promise<void> {
    await this.ensureReady();

    if (!this.serviceId) {
      throw new Error("Sandbox not created or attached");
    }

    logger.info(
      { serviceId: this.serviceId, remotePath },
      "[sandbox] Writing file"
    );

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    // Ensure parent directory exists
    const dir = remotePath.substring(0, remotePath.lastIndexOf("/"));
    if (dir) {
      await this.exec(`mkdir -p "${dir}"`);
    }

    await this.api.fileCopy.uploadServiceFileStream(
      { projectId: this.config.projectId, serviceId: this.serviceId },
      {
        source: buffer,
        remotePath: remotePath,
      }
    );
  }

  /**
   * Read a file from the sandbox
   */
  async readFile(remotePath: string): Promise<Buffer> {
    await this.ensureReady();

    if (!this.serviceId) {
      throw new Error("Sandbox not created or attached");
    }

    logger.info(
      { serviceId: this.serviceId, remotePath },
      "[sandbox] Reading file"
    );

    const { fileStream, completionPromise } =
      await this.api.fileCopy.downloadServiceFileStream(
        { projectId: this.config.projectId, serviceId: this.serviceId },
        { remotePath: remotePath }
      );

    const chunks: Buffer[] = [];
    fileStream.on("data", (chunk: Buffer) => chunks.push(chunk));

    await completionPromise;
    return Buffer.concat(chunks);
  }

  /**
   * List files in a directory
   */
  async listFiles(
    path: string = "/tmp",
    recursive: boolean = false
  ): Promise<
    Array<{ name: string; type: "file" | "directory"; size?: number }>
  > {
    const cmd = recursive
      ? `find "${path}" -maxdepth 3 -printf '%y %s %p\\n' 2>/dev/null | head -100`
      : `ls -la "${path}" 2>/dev/null`;

    const result = await this.exec(cmd);

    if (result.exitCode !== 0) {
      return [];
    }

    const files: Array<{
      name: string;
      type: "file" | "directory";
      size?: number;
    }> = [];

    if (recursive) {
      // Parse find output: type size path
      for (const line of result.stdout.split("\n")) {
        const parts = line.trim().split(" ");
        if (parts.length >= 3) {
          const [type, size, ...pathParts] = parts;
          const filePath = pathParts.join(" ");
          if (filePath && filePath !== path) {
            files.push({
              name: filePath,
              type: type === "d" ? "directory" : "file",
              size: type === "f" ? parseInt(size, 10) : undefined,
            });
          }
        }
      }
    } else {
      // Parse ls -la output
      for (const line of result.stdout.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 9) {
          const perms = parts[0];
          const size = parseInt(parts[4], 10);
          const name = parts.slice(8).join(" ");
          if (name && name !== "." && name !== "..") {
            files.push({
              name,
              type: perms.startsWith("d") ? "directory" : "file",
              size: perms.startsWith("d") ? undefined : size,
            });
          }
        }
      }
    }

    return files;
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Destroy the sandbox
   */
  async destroy(): Promise<void> {
    await this.ensureReady();

    if (!this.serviceId) {
      return;
    }

    logger.info({ serviceId: this.serviceId }, "[sandbox] Destroying");

    try {
      await this.api.delete.service({
        parameters: {
          projectId: this.config.projectId,
          serviceId: this.serviceId,
        },
      });
      logger.info({ serviceId: this.serviceId }, "[sandbox] Destroyed");
    } catch (err) {
      logger.warn(
        { serviceId: this.serviceId, err },
        "[sandbox] Failed to destroy"
      );
    }

    this.serviceId = null;
    this.createdAt = null;
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  getServiceId(): string | null {
    return this.serviceId;
  }

  getInfo(): SandboxInfo | null {
    if (!this.serviceId || !this.createdAt) {
      return null;
    }
    return {
      serviceId: this.serviceId,
      projectId: this.config.projectId,
      createdAt: this.createdAt,
    };
  }

  // --------------------------------------------------------------------------
  // Pool Operations
  // --------------------------------------------------------------------------

  /**
   * List all sandboxes in the pool from Northflank.
   * Uses the "dust-sandbox-pool" tag to identify pool sandboxes.
   */
  async listPoolSandboxes(): Promise<SandboxInfo[]> {
    await this.ensureReady();

    const response = await this.api.list.services({
      parameters: { projectId: this.config.projectId },
    });

    if (response.error) {
      logger.error(
        { error: response.error },
        "[sandbox] Failed to list pool sandboxes"
      );
      return [];
    }

    return response.data.services
      .filter((s) => s.tags?.includes("dust-sandbox-pool") ?? false)
      .map((s) => ({
        serviceId: s.id,
        projectId: this.config.projectId,
        // Use deployment transition time if available, otherwise current date
        createdAt: s.status?.deployment?.lastTransitionTime
          ? new Date(s.status.deployment.lastTransitionTime)
          : new Date(),
      }));
  }
}

// ============================================================================
// UTILITIES
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get the Northflank API token from config
 */
export function getNorthflankApiToken(): string {
  const token = config.getNorthflankApiToken();
  if (!token) {
    throw new Error("NORTHFLANK_API_TOKEN not configured");
  }
  return token;
}
