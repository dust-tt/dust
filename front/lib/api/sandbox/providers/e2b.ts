import { Sandbox } from "e2b";

import logger from "@app/logger/logger";

import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  SandboxCreateConfig,
  SandboxHandle,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";

interface E2BConfig {
  apiKey: string;
  templateId: string;
  domain: string | undefined;
}

/**
 * E2B implementation of SandboxProvider.
 *
 * All E2B-specific logic is isolated here — the rest of the codebase only
 * sees the SandboxProvider interface.
 */
export class E2BSandboxProvider implements SandboxProvider {
  private readonly apiKey: string;
  private readonly templateId: string;
  private readonly domain: string | undefined;

  constructor(config: E2BConfig) {
    this.apiKey = config.apiKey;
    this.templateId = config.templateId;
    this.domain = config.domain;
  }

  private connectionOpts(): { apiKey: string; domain?: string } {
    return {
      apiKey: this.apiKey,
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  private async connect(providerId: string): Promise<Sandbox> {
    return Sandbox.connect(providerId, this.connectionOpts());
  }

  async create(config: SandboxCreateConfig): Promise<SandboxHandle> {
    const templateId = config.templateId ?? this.templateId;

    logger.info({ templateId }, "Creating E2B sandbox");

    const sandbox = await Sandbox.create(templateId, {
      ...this.connectionOpts(),
      envs: config.envVars,
      timeoutMs: 300_000,
    });

    logger.info(
      { sandboxId: sandbox.sandboxId, templateId },
      "E2B sandbox created"
    );

    return { providerId: sandbox.sandboxId };
  }

  async wake(providerId: string): Promise<SandboxHandle> {
    logger.info({ providerId }, "Waking E2B sandbox");

    // Sandbox.connect auto-resumes paused sandboxes.
    await this.connect(providerId);

    logger.info({ providerId }, "E2B sandbox woken");

    return { providerId };
  }

  async sleep(providerId: string): Promise<void> {
    logger.info({ providerId }, "Pausing E2B sandbox");

    const sandbox = await this.connect(providerId);
    await sandbox.betaPause();

    logger.info({ providerId }, "E2B sandbox paused");
  }

  async destroy(providerId: string): Promise<void> {
    logger.info({ providerId }, "Killing E2B sandbox");

    await Sandbox.kill(providerId, this.connectionOpts());

    logger.info({ providerId }, "E2B sandbox killed");
  }

  async exec(
    providerId: string,
    command: string,
    opts?: ExecOptions
  ): Promise<ExecResult> {
    const sandbox = await this.connect(providerId);

    const result = await sandbox.commands.run(command, {
      cwd: opts?.workingDirectory,
      envs: opts?.envVars,
      timeoutMs: opts?.timeoutMs,
    });

    return {
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  async writeFile(
    _providerId: string,
    _path: string,
    _content: Buffer
  ): Promise<void> {
    throw new Error("writeFile is not implemented yet.");
  }

  async readFile(_providerId: string, _path: string): Promise<Buffer> {
    throw new Error("readFile is not implemented yet.");
  }

  async listFiles(
    _providerId: string,
    _path: string,
    _opts?: { recursive?: boolean }
  ): Promise<FileEntry[]> {
    throw new Error("listFiles is not implemented yet.");
  }
}
