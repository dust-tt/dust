/**
 * Northflank Sandbox Client
 *
 * Wraps the Northflank JS SDK to provide sandbox lifecycle management.
 * Sandboxes are isolated Linux containers for executing code and commands.
 */

import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { setTimeoutAsync } from "@app/lib/utils/async_utils";
import { streamToBuffer } from "@app/lib/utils/streams";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import {
  ApiClient,
  ApiClientInMemoryContextProvider,
  ExecCommandStandard,
} from "@northflank/js-client";
import https from "https";
import path from "path";

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
  // Timeout for a single exec attempt (used for readiness probing).
  execAttemptTimeoutMs: number;
  // Timeout for a regular exec call.
  execTimeoutMs: number;
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
  execAttemptTimeoutMs: 5_000,
  execTimeoutMs: 60_000,
  volumeSizeMb: 4096,
  volumeMountPath: "/workspace",
};

const httpsAgent = new https.Agent({ keepAlive: true });

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

export interface SandboxStatus {
  info: SandboxInfo;
  isPaused: boolean;
}

export interface SandboxMetadata {
  conversationId?: string;
  agentConfigurationId?: string;
}

interface ExecAttemptResult {
  ok: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
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

/**
 * Attached sandbox instance with all operations.
 */
export class Sandbox {
  readonly info: SandboxInfo;
  private readonly api: ApiClient;
  private readonly config: SandboxConfig;

  constructor(api: ApiClient, config: SandboxConfig, info: SandboxInfo) {
    this.api = api;
    this.config = config;
    this.info = info;
  }

  private get serviceParams() {
    return { projectId: this.info.projectId, serviceId: this.info.serviceId };
  }

  private getExecContext(): { baseUrl: string; token: string } {
    const baseUrl = this.api.contextProvider.getCurrentBaseUrl(true);
    const token = this.api.contextProvider.getCurrentToken();

    if (!baseUrl) {
      throw new Error("Northflank base URL not configured in context provider");
    }
    if (!token) {
      throw new Error("Northflank token not configured in context provider");
    }

    return { baseUrl, token };
  }

  private async tryExec(
    command: string[],
    timeoutMs: number
  ): Promise<ExecAttemptResult> {
    const { baseUrl, token } = this.getExecContext();
    const { projectId, serviceId } = this.serviceParams;

    return new Promise<ExecAttemptResult>((resolve) => {
      let settled = false;
      const finish = (result: ExecAttemptResult) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        finish({
          ok: false,
          exitCode: 124,
          stdout: "",
          stderr: "",
          error: "exec timeout",
        });
      }, timeoutMs);

      try {
        const session = new ExecCommandStandard(
          baseUrl,
          {
            projectId,
            entityType: "service",
            entityId: serviceId,
            command,
            shell: "none",
            encoding: "utf-8",
          },
          token,
          httpsAgent
        );

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];

        session.stdOut.on("data", (chunk: unknown) => {
          stdoutChunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf-8")
          );
        });
        session.stdErr.on("data", (chunk: unknown) => {
          stderrChunks.push(
            Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), "utf-8")
          );
        });

        session.once("error", (err: unknown) => {
          const msg = normalizeError(err).message;
          finish({
            ok: false,
            exitCode: 1,
            stdout: "",
            stderr: "",
            error: msg,
          });
        });

        session.start().then(
          (result) => {
            const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
            const stderr = Buffer.concat(stderrChunks).toString("utf-8");
            const exitCode = result.exitCode ?? 1;

            if (result.status === "Success") {
              finish({
                ok: exitCode === 0,
                exitCode,
                stdout,
                stderr,
                error:
                  exitCode === 0
                    ? undefined
                    : `exit=${exitCode} msg=${result.message ?? ""}`,
              });
              return;
            }

            finish({
              ok: false,
              exitCode,
              stdout,
              stderr,
              error: `status=${result.status} exit=${exitCode} msg=${result.message ?? ""}`,
            });
          },
          (err: unknown) => {
            const msg = normalizeError(err).message;
            finish({
              ok: false,
              exitCode: 1,
              stdout: "",
              stderr: "",
              error: msg,
            });
          }
        );
      } catch (err) {
        const msg = normalizeError(err).message;
        finish({ ok: false, exitCode: 1, stdout: "", stderr: "", error: msg });
      }
    });
  }

  async pause(): Promise<void> {
    if (await this.isServicePaused()) {
      logger.info(
        { serviceId: this.info.serviceId },
        "[sandbox] Already paused"
      );
      return;
    }

    logger.info({ serviceId: this.info.serviceId }, "[sandbox] Pausing");

    const response = await this.api.pause.service({
      parameters: this.serviceParams,
    });

    if (response.error) {
      throw new Error(
        `Failed to pause sandbox: ${normalizeError(response.error).message}`
      );
    }

    logger.info({ serviceId: this.info.serviceId }, "[sandbox] Paused");
  }

  /**
   * Resume a paused sandbox.
   *
   * Returns Err for readiness timeout. Throws for infrastructure failures.
   */
  async resume(): Promise<Result<void, SandboxReadyTimeoutError>> {
    if (!(await this.isServicePaused())) {
      logger.info(
        { serviceId: this.info.serviceId },
        "[sandbox] Already running"
      );
      return new Ok(undefined);
    }

    logger.info({ serviceId: this.info.serviceId }, "[sandbox] Resuming");

    const response = await this.api.resume.service({
      parameters: this.serviceParams,
      data: { instances: 1 },
    });

    if (response.error) {
      throw new Error(
        `Failed to resume sandbox: ${normalizeError(response.error).message}`
      );
    }

    return this.waitForReady();
  }

  async exec(
    command: string,
    options?: { timeoutMs?: number }
  ): Promise<CommandResult> {
    logger.info(
      { serviceId: this.info.serviceId, command },
      "[sandbox] Executing command"
    );

    const timeoutMs = options?.timeoutMs ?? this.config.execTimeoutMs;
    const result = await this.tryExec(["bash", "-c", command], timeoutMs);
    const stderr = result.stderr !== "" ? result.stderr : (result.error ?? "");

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr,
    };
  }

  async writeFile(remotePath: string, content: string | Buffer): Promise<void> {
    logger.info(
      { serviceId: this.info.serviceId, remotePath },
      "[sandbox] Writing file"
    );

    const buffer = typeof content === "string" ? Buffer.from(content) : content;

    const dir = path.posix.dirname(remotePath);
    if (dir && dir !== "." && dir !== "/") {
      const mkdirResult = await this.tryExec(
        ["mkdir", "-p", dir],
        this.config.execTimeoutMs
      );
      if (!mkdirResult.ok) {
        throw new Error(
          `Failed to create directory "${dir}": ` +
            `${mkdirResult.error ?? mkdirResult.stderr}`
        );
      }
    }

    await this.api.fileCopy.uploadServiceFileStream(this.serviceParams, {
      source: buffer,
      remotePath,
    });
  }

  async readFile(remotePath: string): Promise<Buffer> {
    logger.info(
      { serviceId: this.info.serviceId, remotePath },
      "[sandbox] Reading file"
    );

    const { fileStream, completionPromise } =
      await this.api.fileCopy.downloadServiceFileStream(this.serviceParams, {
        remotePath,
      });

    const [result, success] = await Promise.all([
      streamToBuffer(fileStream),
      completionPromise,
    ]);

    if (result.isErr()) {
      throw new Error(result.error);
    }

    if (!success) {
      throw new Error(`Failed to read file "${remotePath}"`);
    }

    return result.value;
  }

  async destroy(): Promise<void> {
    const { serviceId, volumeId, projectId } = this.info;

    logger.info({ serviceId, volumeId }, "[sandbox] Destroying");

    await this.deleteServiceIfExists(projectId, serviceId);
    await this.deleteVolumeIfExists(projectId, volumeId);

    logger.info({ serviceId, volumeId }, "[sandbox] Destroyed");
  }

  private async deleteServiceIfExists(
    projectId: string,
    serviceId: string
  ): Promise<void> {
    const response = await this.api.delete.service({
      parameters: { projectId, serviceId },
    });

    if (response.error && response.error.status !== 404) {
      throw new Error(
        `Failed to delete service: ${normalizeError(response.error).message}`
      );
    }
  }

  private async deleteVolumeIfExists(
    projectId: string,
    volumeId: string
  ): Promise<void> {
    const response = await this.api.delete.volume({
      parameters: { projectId, volumeId },
    });

    if (response.error && response.error.status !== 404) {
      throw new Error(
        `Failed to delete volume: ${normalizeError(response.error).message}`
      );
    }
  }

  private async isServicePaused(): Promise<boolean> {
    const response = await this.api.get.service({
      parameters: this.serviceParams,
    });

    if (response.error) {
      throw new Error(
        `Failed to get service status: ${normalizeError(response.error).message}`
      );
    }

    return response.data.servicePaused;
  }

  /**
   * Wait until the sandbox is actually usable.
   *
   * We align readiness with the benchmark approach: retry exec until it succeeds.
   * Returns Err on timeout, throws on deployment failure.
   */
  async waitForReady(): Promise<Result<void, SandboxReadyTimeoutError>> {
    logger.info(
      { serviceId: this.info.serviceId },
      "[sandbox] Waiting for ready"
    );

    const startTimeMs = Date.now();
    let attempts = 0;
    let lastStatusCheckMs = 0;

    while (Date.now() - startTimeMs < this.config.serviceReadyTimeoutMs) {
      attempts++;
      const execResult = await this.tryExec(
        ["bash", "-c", "echo i_am_online"],
        this.config.execAttemptTimeoutMs
      );
      if (execResult.ok && execResult.stdout.includes("i_am_online")) {
        logger.info(
          { serviceId: this.info.serviceId, attempts },
          "[sandbox] Service ready"
        );
        return new Ok(undefined);
      }

      const nowMs = Date.now();
      if (nowMs - lastStatusCheckMs >= 2_000) {
        lastStatusCheckMs = nowMs;
        const response = await this.api.get.service({
          parameters: this.serviceParams,
        });

        if (response.error) {
          throw new Error(
            `Failed to poll service status: ${normalizeError(response.error).message}`
          );
        }

        const { status } = response.data;
        const deploymentStatus = status?.deployment?.status;
        if (deploymentStatus === "FAILED") {
          logger.error(
            { serviceId: this.info.serviceId, status },
            "[sandbox] Deployment failed"
          );
          throw new Error(
            `Sandbox deployment failed (status: ${JSON.stringify(status)})`
          );
        }
      }

      await setTimeoutAsync(this.config.pollIntervalMs);
    }

    return new Err(
      new SandboxReadyTimeoutError(
        this.info.serviceId,
        this.config.serviceReadyTimeoutMs
      )
    );
  }
}

/**
 * Factory for creating and attaching to sandboxes.
 */
export class NorthflankSandboxClient {
  private readonly api: ApiClient;
  private readonly config: SandboxConfig;

  private constructor(api: ApiClient, config: SandboxConfig) {
    this.api = api;
    this.config = config;
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

  private serviceIdForSandbox(auth: Authenticator, sandboxId: string): string {
    const workspaceSId = auth.getNonNullableWorkspace().sId;
    return `${workspaceSId}-${sandboxId}`;
  }

  /**
   * Create a new sandbox.
   *
   * Returns Err for recoverable errors (service ID collision, readiness timeout).
   * Throws for infrastructure failures (API errors, deployment failures).
   */
  async createSandbox(
    auth: Authenticator,
    sandboxId: string,
    metadata?: SandboxMetadata
  ): Promise<Result<Sandbox, SandboxError>> {
    const serviceId = this.serviceIdForSandbox(auth, sandboxId);
    const tags = this.buildTags(metadata);

    logger.info(
      { serviceId, image: this.config.baseImage, tags },
      "[sandbox] Creating service"
    );

    // Northflank uses name as the service ID for slug-formatted names
    const serviceResponse = await this.api.create.service.deployment({
      parameters: { projectId: this.config.projectId },
      data: {
        name: serviceId,
        tags,
        billing: { deploymentPlan: this.config.deploymentPlan },
        deployment: {
          instances: 1,
          external: { imagePath: this.config.baseImage },
          docker: {
            configType: "customCommand",
            customCommand: "sleep infinity",
          },
        },
        runtimeEnvironment: {},
      },
    });

    if (serviceResponse.error) {
      if (
        serviceResponse.error.status === 400 &&
        serviceResponse.error.message === "Service already exists"
      ) {
        return new Err(new ServiceAlreadyExistsError(serviceId));
      }
      throw new Error(
        `Failed to create sandbox: ${normalizeError(serviceResponse.error).message}`
      );
    }

    const createdAt = new Date();

    logger.info({ serviceId }, "[sandbox] Service created");

    const volumeId = this.volumeIdForService(serviceId);
    logger.info(
      { volumeId, sizeMb: this.config.volumeSizeMb },
      "[sandbox] Creating volume"
    );

    const volumeResponse = await this.api.create.volume({
      parameters: { projectId: this.config.projectId },
      data: {
        name: volumeId,
        tags,
        mounts: [{ containerMountPath: this.config.volumeMountPath }],
        spec: {
          accessMode: "ReadWriteOnce",
          storageSize: this.config.volumeSizeMb,
        },
        attachedObjects: [{ id: serviceId, type: "service" }],
      },
    });

    if (volumeResponse.error) {
      await this.api.delete.service({
        parameters: { projectId: this.config.projectId, serviceId },
      });
      throw new Error(
        `Failed to create volume: ${normalizeError(volumeResponse.error).message}`
      );
    }

    logger.info(
      { serviceId, volumeId },
      "[sandbox] Volume created and attached"
    );

    const info: SandboxInfo = {
      serviceId,
      volumeId,
      projectId: this.config.projectId,
      createdAt,
    };

    const sandbox = new Sandbox(this.api, this.config, info);

    try {
      const readyResult = await sandbox.waitForReady();
      if (readyResult.isErr()) {
        await this.cleanupResources(serviceId, volumeId);
        return readyResult;
      }
    } catch (err) {
      await this.cleanupResources(serviceId, volumeId);
      throw err;
    }

    return new Ok(sandbox);
  }

  attach(info: SandboxInfo): Sandbox {
    return new Sandbox(this.api, this.config, info);
  }

  /**
   * Look up an existing sandbox by service ID.
   *
   * Returns the sandbox status (info + paused state) if found, null if not found.
   * Throws for API errors or if service exists but volume is missing.
   */
  async getSandbox(
    auth: Authenticator,
    sandboxId: string
  ): Promise<SandboxStatus | null> {
    const serviceId = this.serviceIdForSandbox(auth, sandboxId);
    const serviceResponse = await this.api.get.service({
      parameters: {
        projectId: this.config.projectId,
        serviceId,
      },
    });

    if (serviceResponse.error) {
      if (serviceResponse.error.status === 404) {
        return null;
      }
      throw new Error(
        `Failed to get service: ${normalizeError(serviceResponse.error).message}`
      );
    }

    const service = serviceResponse.data;

    const volumeId = this.volumeIdForService(serviceId);
    const volumeResponse = await this.api.get.volume({
      parameters: { projectId: this.config.projectId, volumeId },
    });

    if (volumeResponse.error) {
      if (volumeResponse.error.status === 404) {
        throw new Error(
          `Service "${serviceId}" exists but volume "${volumeId}" not found. ` +
            `The sandbox may be in an inconsistent state.`
        );
      }
      throw new Error(
        `Failed to get volume: ${normalizeError(volumeResponse.error).message}`
      );
    }

    return {
      info: {
        serviceId: service.id,
        volumeId: volumeResponse.data.id,
        projectId: this.config.projectId,
        createdAt: new Date(service.createdAt),
      },
      isPaused: service.servicePaused,
    };
  }

  private volumeIdForService(serviceId: string): string {
    return `${serviceId}-vol`;
  }

  private buildTags(metadata?: SandboxMetadata): string[] {
    const tags = this.config.spotTag ? [this.config.spotTag] : [];

    if (metadata) {
      const metadataTags = Object.entries(metadata)
        .filter(([, value]) => value)
        .map(([key, value]) => `${key}:${value}`);
      tags.push(...metadataTags);
    }

    return tags;
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
}
