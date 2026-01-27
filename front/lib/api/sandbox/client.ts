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
  deploymentPlan: "nf-compute-20",
  projectId: apiConfig.getNorthflankProjectId() ?? "dust-sandbox-dev",
  spotTag: "spot-workload",
  serviceReadyTimeoutMs: 120_000,
  pollIntervalMs: 500,
  volumeSizeMb: 4096,
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
  private readonly config: SandboxConfig;
  private serviceId: string | null = null;
  private volumeId: string | null = null;
  private createdAt: Date | null = null;

  private constructor(api: ApiClient, config: SandboxConfig) {
    this.api = api;
    this.config = config;
  }

  private requireServiceId(): string {
    if (!this.serviceId) {
      throw new Error("Sandbox not created or attached");
    }
    return this.serviceId;
  }

  private resetState(): void {
    this.serviceId = null;
    this.volumeId = null;
    this.createdAt = null;
  }

  static async create(
    apiToken: string,
    configOverrides?: Partial<SandboxConfig>
  ): Promise<NorthflankSandboxClient> {
    const config = { ...DEFAULT_CONFIG, ...configOverrides };
    const contextProvider = new ApiClientInMemoryContextProvider();
    await contextProvider.addContext({ name: "default", token: apiToken });
    return new NorthflankSandboxClient(new ApiClient(contextProvider), config);
  }

  /**
   * Create a new sandbox.
   *
   * Returns Err for recoverable errors (service name collision, readiness timeout).
   * Throws for infrastructure failures (API errors, deployment failures).
   */
  async createSandbox(
    serviceName: string,
    metadata?: SandboxMetadata
  ): Promise<Result<SandboxInfo, SandboxError>> {
    const tags = this.buildTags(metadata);

    logger.info(
      { serviceName, image: this.config.baseImage, tags },
      "[sandbox] Creating service"
    );

    const serviceResponse = await this.api.create.service.deployment({
      parameters: { projectId: this.config.projectId },
      data: {
        name: serviceName,
        tags,
        billing: { deploymentPlan: this.config.deploymentPlan },
        deployment: {
          instances: 1,
          external: { imagePath: this.config.baseImage },
          docker: { configType: "customCommand", customCommand: "sleep infinity" },
        },
        runtimeEnvironment: {},
      },
    });

    if (serviceResponse.error) {
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

    const volumeName = `${serviceName}-vol`;
    logger.info(
      { volumeName, sizeMb: this.config.volumeSizeMb },
      "[sandbox] Creating volume"
    );

    const volumeResponse = await this.api.create.volume({
      parameters: { projectId: this.config.projectId },
      data: {
        name: volumeName,
        tags,
        mounts: [{ containerMountPath: this.config.volumeMountPath }],
        spec: { accessMode: "ReadWriteOnce", storageSize: this.config.volumeSizeMb },
        attachedObjects: [{ id: serviceId, type: "service" }],
      },
    });

    if (volumeResponse.error) {
      await this.api.delete.service({
        parameters: { projectId: this.config.projectId, serviceId },
      });
      throw new Error(
        `Failed to create volume: ${volumeResponse.error.message ?? "Unknown error"}`
      );
    }

    const volumeId = volumeResponse.data.id;
    this.volumeId = volumeId;

    logger.info({ serviceId, volumeId }, "[sandbox] Volume created and attached");

    try {
      const readyResult = await this.waitForReady();
      if (readyResult.isErr()) {
        await this.cleanupResources(serviceId, volumeId);
        this.resetState();
        return readyResult;
      }
    } catch (err) {
      await this.cleanupResources(serviceId, volumeId);
      this.resetState();
      throw err;
    }

    return new Ok({
      serviceId,
      volumeId,
      projectId: this.config.projectId,
      createdAt,
    });
  }

  private buildTags(metadata?: SandboxMetadata): string[] {
    const tags: string[] = [];
    if (this.config.spotTag) {
      tags.push(this.config.spotTag);
    }
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        if (value) {
          tags.push(`${key}:${value}`);
        }
      }
    }
    return tags;
  }

  attach(info: SandboxInfo): void {
    this.serviceId = info.serviceId;
    this.volumeId = info.volumeId;
    this.createdAt = info.createdAt;
  }

  async pause(): Promise<void> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId }, "[sandbox] Pausing");

    const response = await this.api.pause.service({
      parameters: { projectId: this.config.projectId, serviceId },
    });

    if (response.error) {
      throw new Error(
        `Failed to pause sandbox: ${response.error.message ?? "Unknown error"}`
      );
    }

    logger.info({ serviceId }, "[sandbox] Paused");
  }

  /**
   * Resume a paused sandbox.
   *
   * Returns Err for readiness timeout. Throws for infrastructure failures.
   */
  async resume(): Promise<Result<void, SandboxReadyTimeoutError>> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId }, "[sandbox] Resuming");

    const response = await this.api.resume.service({
      parameters: { projectId: this.config.projectId, serviceId },
      data: { instances: 1 },
    });

    if (response.error) {
      throw new Error(
        `Failed to resume sandbox: ${response.error.message ?? "Unknown error"}`
      );
    }

    return this.waitForReady();
  }

  private async waitForReady(): Promise<Result<void, SandboxReadyTimeoutError>> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId }, "[sandbox] Waiting for ready");

    const startTimeMs = Date.now();
    while (Date.now() - startTimeMs < this.config.serviceReadyTimeoutMs) {
      const response = await this.api.get.service({
        parameters: { projectId: this.config.projectId, serviceId },
      });

      if (response.error) {
        throw new Error(
          `Failed to poll service status: ${response.error.message ?? "Unknown error"}`
        );
      }

      const { status } = response.data;
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

      await setTimeoutAsync(this.config.pollIntervalMs);
    }

    return new Err(
      new SandboxReadyTimeoutError(serviceId, this.config.serviceReadyTimeoutMs)
    );
  }

  private async cleanupResources(
    serviceId: string,
    volumeId: string
  ): Promise<void> {
    logger.info({ serviceId, volumeId }, "[sandbox] Cleaning up resources");

    const serviceResponse = await this.api.delete.service({
      parameters: { projectId: this.config.projectId, serviceId },
    });
    if (serviceResponse.error) {
      logger.error(
        { serviceId, error: serviceResponse.error },
        "[sandbox] Failed to delete service during cleanup"
      );
    }

    const volumeResponse = await this.api.delete.volume({
      parameters: { projectId: this.config.projectId, volumeId },
    });
    if (volumeResponse.error) {
      logger.error(
        { volumeId, error: volumeResponse.error },
        "[sandbox] Failed to delete volume during cleanup"
      );
    }
  }

  async exec(command: string): Promise<CommandResult> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId, command }, "[sandbox] Executing command");

    const result = await this.api.exec.execServiceCommand(
      { projectId: this.config.projectId, serviceId },
      { command: ["bash", "-c", command], shell: "none" }
    );

    return {
      exitCode: result.commandResult.exitCode,
      stdout: result.stdOut,
      stderr: result.stdErr,
    };
  }

  async writeFile(remotePath: string, content: string | Buffer): Promise<void> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId, remotePath }, "[sandbox] Writing file");

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    const dir = path.posix.dirname(remotePath);
    if (dir && dir !== "." && dir !== "/") {
      await this.exec(`mkdir -p "${dir}"`);
    }

    await this.api.fileCopy.uploadServiceFileStream(
      { projectId: this.config.projectId, serviceId },
      { source: buffer, remotePath }
    );
  }

  async readFile(remotePath: string): Promise<Buffer> {
    const serviceId = this.requireServiceId();
    logger.info({ serviceId, remotePath }, "[sandbox] Reading file");

    const { fileStream } = await this.api.fileCopy.downloadServiceFileStream(
      { projectId: this.config.projectId, serviceId },
      { remotePath }
    );

    const result = await streamToBuffer(fileStream);
    if (result.isErr()) {
      throw new Error(result.error);
    }
    return result.value;
  }

  async destroy(): Promise<void> {
    if (!this.serviceId) {
      return;
    }

    const serviceId = this.serviceId;
    const volumeId = this.volumeId;

    logger.info({ serviceId, volumeId }, "[sandbox] Destroying");

    const serviceResponse = await this.api.delete.service({
      parameters: { projectId: this.config.projectId, serviceId },
    });

    if (serviceResponse.error) {
      throw new Error(
        `Failed to delete service: ${serviceResponse.error.message ?? "Unknown error"}`
      );
    }

    if (volumeId) {
      const volumeResponse = await this.api.delete.volume({
        parameters: { projectId: this.config.projectId, volumeId },
      });

      if (volumeResponse.error) {
        throw new Error(
          `Failed to delete volume: ${volumeResponse.error.message ?? "Unknown error"}`
        );
      }
    }

    logger.info({ serviceId, volumeId }, "[sandbox] Destroyed");
    this.resetState();
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
      projectId: this.config.projectId,
      createdAt: this.createdAt,
    };
  }
}
