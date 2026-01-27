/**
 * Northflank Sandbox Client
 *
 * Wraps the Northflank JS SDK to provide sandbox lifecycle management.
 * Sandboxes are isolated Linux containers for executing code and commands.
 */

import {
  ApiClient,
  ApiClientInMemoryContextProvider,
} from "@northflank/js-client";
import path from "path";

import apiConfig from "@app/lib/api/config";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { streamToBuffer } from "@app/lib/utils/streams";
import logger from "@app/logger/logger";
import { Err, Ok, Result } from "@app/types";

interface SandboxConfig {
  // Docker image for the sandbox container.
  baseImage: string;
  // Northflank compute plan. Affects CPU/memory and cost.
  // See https://northflank.com/pricing
  deploymentPlan: string;

  projectId: string;
  // Tag for spot node scheduling. Spot is cheaper but can be preempted.
  // Set empty string to use on-demand instances.
  spotTag: string;
  // Timeout for sandbox to become ready. Account for cold image pulls.
  serviceReadyTimeoutMs: number;
  // Polling interval for readiness checks.
  pollIntervalMs: number;
  // Persistent volume size in MB. Minimum 4096 (4GB).
  volumeSizeMb: number;
  // Mount path for persistent volume inside the container.
  volumeMountPath: string;
}

const DEFAULT_CONFIG: SandboxConfig = {
  baseImage: "ubuntu:22.04",
  deploymentPlan: "nf-compute-20", // Smallest plan (0.2 vCPU). Scale up if needed.
  projectId: apiConfig.getNorthflankProjectId() ?? "dust-sandbox-dev",
  spotTag: "spot-workload",
  serviceReadyTimeoutMs: 120_000, // 2 minutes. Account for cold image pulls.
  pollIntervalMs: 500,
  volumeSizeMb: 4096, // 4GB minimum
  volumeMountPath: "/workspace",
};

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxInfo {
  serviceId: string;
  volumeId: string;
  projectId: string;
  createdAt: Date;
}

export interface SandboxMetadata {
  workspaceId?: string;
  conversationId?: string;
  agentConfigurationId?: string;
}

export class ServiceAlreadyExistsError extends Error {
  constructor(serviceName: string) {
    super(`Service "${serviceName}" already exists`);
    this.name = "ServiceAlreadyExistsError";
  }
}

export class SandboxReadyTimeoutError extends Error {
  constructor(serviceId: string, timeoutMs: number) {
    super(`Sandbox "${serviceId}" did not become ready within ${timeoutMs}ms`);
    this.name = "SandboxReadyTimeoutError";
  }
}

export type SandboxError = ServiceAlreadyExistsError | SandboxReadyTimeoutError;

export class NorthflankSandboxClient {
  private readonly api: ApiClient;
  private readonly sandboxConfig: SandboxConfig;
  private serviceId: string | null = null;
  private volumeId: string | null = null;
  private createdAt: Date | null = null;

  private constructor(api: ApiClient, config: SandboxConfig) {
    this.api = api;
    this.sandboxConfig = config;
  }

  /**
   * Ensure the sandbox has been created or attached before operations.
   * @throws Error if serviceId is null
   */
  private requireServiceId(): string {
    if (!this.serviceId) {
      throw new Error("Sandbox not created or attached");
    }
    return this.serviceId;
  }

  /**
   * Create a new NorthflankSandboxClient instance.
   */
  static async create(
    apiToken: string,
    configOverrides?: Partial<SandboxConfig>
  ): Promise<NorthflankSandboxClient> {
    const config = { ...DEFAULT_CONFIG, ...configOverrides };
    const contextProvider = new ApiClientInMemoryContextProvider();
    await contextProvider.addContext({
      name: "default",
      token: apiToken,
    });
    const api = new ApiClient(contextProvider);
    return new NorthflankSandboxClient(api, config);
  }

  /**
   * Create a new sandbox VM.
   * @param serviceName Unique name for the service (e.g., based on conversationId)
   * @param metadata Optional metadata tags for tracking
   * @returns Result with SandboxInfo on success, or SandboxError on failure
   */
  async createSandbox(
    serviceName: string,
    metadata?: SandboxMetadata
  ): Promise<Result<SandboxInfo, SandboxError>> {
    const tags = [
      this.sandboxConfig.spotTag,
      metadata?.workspaceId && `workspace:${metadata.workspaceId}`,
      metadata?.conversationId && `conversation:${metadata.conversationId}`,
      metadata?.agentConfigurationId && `agent:${metadata.agentConfigurationId}`,
    ].filter((tag): tag is string => Boolean(tag));

    logger.info(
      { serviceName, image: this.sandboxConfig.baseImage, tags },
      "[sandbox] Creating service"
    );

    const serviceResponse = await this.api.create.service.deployment({
      parameters: { projectId: this.sandboxConfig.projectId },
      data: {
        name: serviceName,
        tags,
        billing: {
          deploymentPlan: this.sandboxConfig.deploymentPlan,
        },
        deployment: {
          instances: 1,
          external: {
            imagePath: this.sandboxConfig.baseImage,
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
      // Northflank returns 400 "Service already exists" for duplicate names
      if (
        serviceResponse.error.status === 400 &&
        serviceResponse.error.message === "Service already exists"
      ) {
        return new Err(new ServiceAlreadyExistsError(serviceName));
      }
      throw new Error(
        `Failed to create sandbox: ${serviceResponse.error.message ?? "Unknown error"}`
      );
    }

    const serviceId = serviceResponse.data.id;
    const createdAt = new Date();

    this.serviceId = serviceId;
    this.createdAt = createdAt;

    logger.info({ serviceId }, "[sandbox] Service created");

    // Create and attach persistent volume
    const volumeName = `${serviceName}-vol`;
    logger.info(
      { volumeName, sizeMb: this.sandboxConfig.volumeSizeMb },
      "[sandbox] Creating volume"
    );

    const volumeResponse = await this.api.create.volume({
      parameters: { projectId: this.sandboxConfig.projectId },
      data: {
        name: volumeName,
        tags,
        mounts: [{ containerMountPath: this.sandboxConfig.volumeMountPath }],
        spec: {
          accessMode: "ReadWriteOnce",
          storageSize: this.sandboxConfig.volumeSizeMb,
        },
        attachedObjects: [{ id: serviceId, type: "service" }],
      },
    });

    if (volumeResponse.error) {
      // Clean up the service if volume creation fails
      await this.api.delete.service({
        parameters: {
          projectId: this.sandboxConfig.projectId,
          serviceId,
        },
      });
      throw new Error(
        `Failed to create volume: ${volumeResponse.error.message ?? "Unknown error"}`
      );
    }

    const volumeId = volumeResponse.data.id;
    this.volumeId = volumeId;

    logger.info({ serviceId, volumeId }, "[sandbox] Volume created and attached");

    const readyResult = await this.waitForReady();
    if (readyResult.isErr()) {
      // Clean up resources on timeout to avoid orphaned services/volumes
      await this.cleanupResources(serviceId, volumeId);
      this.serviceId = null;
      this.volumeId = null;
      this.createdAt = null;
      return readyResult;
    }

    return new Ok({
      serviceId,
      volumeId,
      projectId: this.sandboxConfig.projectId,
      createdAt,
    });
  }

  /**
   * Attach to an existing sandbox.
   * Note: projectId from info is not used - the client uses its configured projectId.
   */
  attach(info: SandboxInfo): void {
    this.serviceId = info.serviceId;
    this.volumeId = info.volumeId;
    this.createdAt = info.createdAt;
  }

  /**
   * Pause the sandbox. Scales to 0 instances but keeps volume intact.
   */
  async pause(): Promise<void> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId }, "[sandbox] Pausing");

    const response = await this.api.pause.service({
      parameters: { projectId: this.sandboxConfig.projectId, serviceId },
    });

    if (response.error) {
      throw new Error(
        `Failed to pause sandbox: ${response.error.message ?? "Unknown error"}`
      );
    }

    logger.info({ serviceId }, "[sandbox] Paused");
  }

  /**
   * Resume a paused sandbox. Scales back to 1 instance and waits for ready.
   */
  async resume(): Promise<Result<void, SandboxReadyTimeoutError>> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId }, "[sandbox] Resuming");

    const response = await this.api.resume.service({
      parameters: { projectId: this.sandboxConfig.projectId, serviceId },
      data: { instances: 1 },
    });

    if (response.error) {
      throw new Error(
        `Failed to resume sandbox: ${response.error.message ?? "Unknown error"}`
      );
    }

    return this.waitForReady();
  }

  /**
   * Wait for the service to be ready.
   */
  private async waitForReady(): Promise<Result<void, SandboxReadyTimeoutError>> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId }, "[sandbox] Waiting for ready");

    const startTimeMs = Date.now();
    while (Date.now() - startTimeMs < this.sandboxConfig.serviceReadyTimeoutMs) {
      const response = await this.api.get.service({
        parameters: { projectId: this.sandboxConfig.projectId, serviceId },
      });

      if (response.error) {
        throw new Error(
          `Failed to poll service status: ${response.error.message ?? "Unknown error"}`
        );
      }

      const status = response.data.status;
      const deploymentStatus = status?.deployment?.status;

      if (deploymentStatus === "COMPLETED") {
        logger.info({ serviceId }, "[sandbox] Service ready");
        return new Ok(undefined);
      }

      if (deploymentStatus === "FAILED") {
        logger.error({ serviceId, status }, "[sandbox] Deployment failed");
        throw new Error(
          `Sandbox deployment failed (status: ${JSON.stringify(status)})`
        );
      }

      await setTimeoutAsync(this.sandboxConfig.pollIntervalMs);
    }

    return new Err(
      new SandboxReadyTimeoutError(
        serviceId,
        this.sandboxConfig.serviceReadyTimeoutMs
      )
    );
  }

  /**
   * Best-effort cleanup of service and volume. Used when creation fails partway through.
   */
  private async cleanupResources(
    serviceId: string,
    volumeId: string
  ): Promise<void> {
    logger.info({ serviceId, volumeId }, "[sandbox] Cleaning up resources");

    try {
      await this.api.delete.service({
        parameters: {
          projectId: this.sandboxConfig.projectId,
          serviceId,
        },
      });
    } catch (err) {
      logger.error({ serviceId, err }, "[sandbox] Failed to delete service during cleanup");
    }

    try {
      await this.api.delete.volume({
        parameters: {
          projectId: this.sandboxConfig.projectId,
          volumeId,
        },
      });
    } catch (err) {
      logger.error({ volumeId, err }, "[sandbox] Failed to delete volume during cleanup");
    }
  }

  /**
   * Execute a command and return the result.
   */
  async exec(command: string): Promise<CommandResult> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId, command }, "[sandbox] Executing command");

    const result = await this.api.exec.execServiceCommand(
      { projectId: this.sandboxConfig.projectId, serviceId },
      { command: ["bash", "-c", command], shell: "none" }
    );

    return {
      exitCode: result.commandResult.exitCode,
      stdout: result.stdOut,
      stderr: result.stdErr,
    };
  }

  /**
   * Write content to a file in the sandbox.
   */
  async writeFile(remotePath: string, content: string | Buffer): Promise<void> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId, remotePath }, "[sandbox] Writing file");

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    // Create parent directories if needed (skip for root or current directory).
    const dir = path.posix.dirname(remotePath);
    if (dir && dir !== "." && dir !== "/") {
      await this.exec(`mkdir -p "${dir}"`);
    }

    await this.api.fileCopy.uploadServiceFileStream(
      { projectId: this.sandboxConfig.projectId, serviceId },
      { source: buffer, remotePath }
    );
  }

  /**
   * Read a file from the sandbox.
   */
  async readFile(remotePath: string): Promise<Buffer> {
    const serviceId = this.requireServiceId();

    logger.info({ serviceId, remotePath }, "[sandbox] Reading file");

    const { fileStream } = await this.api.fileCopy.downloadServiceFileStream(
      { projectId: this.sandboxConfig.projectId, serviceId },
      { remotePath }
    );

    const result = await streamToBuffer(fileStream);
    if (result.isErr()) {
      throw new Error(result.error);
    }
    return result.value;
  }

  /**
   * Destroy the sandbox and its volume
   */
  async destroy(): Promise<void> {
    if (!this.serviceId) {
      return;
    }

    const serviceId = this.serviceId;
    const volumeId = this.volumeId;

    logger.info({ serviceId, volumeId }, "[sandbox] Destroying");

    // Delete service first (detaches the volume)
    const serviceResponse = await this.api.delete.service({
      parameters: {
        projectId: this.sandboxConfig.projectId,
        serviceId,
      },
    });

    if (serviceResponse.error) {
      throw new Error(
        `Failed to delete service: ${serviceResponse.error.message ?? "Unknown error"}`
      );
    }

    // Delete the volume
    if (volumeId) {
      const volumeResponse = await this.api.delete.volume({
        parameters: {
          projectId: this.sandboxConfig.projectId,
          volumeId,
        },
      });

      if (volumeResponse.error) {
        throw new Error(
          `Failed to delete volume: ${volumeResponse.error.message ?? "Unknown error"}`
        );
      }
    }

    logger.info({ serviceId, volumeId }, "[sandbox] Destroyed");

    this.serviceId = null;
    this.volumeId = null;
    this.createdAt = null;
  }

  getServiceId(): string | null {
    return this.serviceId;
  }

  getInfo(): SandboxInfo | null {
    if (!this.serviceId || !this.volumeId || !this.createdAt) {
      return null;
    }
    return {
      serviceId: this.serviceId,
      volumeId: this.volumeId,
      projectId: this.sandboxConfig.projectId,
      createdAt: this.createdAt,
    };
  }
}
