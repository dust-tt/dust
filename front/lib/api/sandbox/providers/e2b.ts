import {
  formatSandboxImageId,
  type NetworkPolicy,
  type SandboxImageId,
} from "@app/lib/api/sandbox/image/types";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  SandboxCreateConfig,
  SandboxHandle,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";
import { SandboxNotFoundError } from "@app/lib/api/sandbox/provider";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { CommandExitError, NotFoundError, Sandbox } from "e2b";

const SANDBOX_LIFETIME_MS = 86_400_000; // 24 hours (E2B Pro max; reaper manages lifecycle)

/** Timeout for individual API calls to E2B (create, connect, etc.). */
const REQUEST_TIMEOUT_MS = 30_000;

const ALL_TRAFFIC = "0.0.0.0/0";

interface E2BNetworkOpts {
  allowOut?: string[];
  denyOut?: string[];
}

function toE2BNetworkOpts(policy: NetworkPolicy): E2BNetworkOpts {
  switch (policy.mode) {
    case "deny_all":
      return {
        allowOut: policy.allowlist ? [...policy.allowlist] : [],
        denyOut: [ALL_TRAFFIC],
      };
    case "allow_all":
      return {};
    default:
      assertNever(policy.mode);
  }
}

interface E2BConfig {
  apiKey: string;
  imageId: SandboxImageId;
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
  private readonly imageId: SandboxImageId;
  private readonly domain: string | undefined;

  constructor(config: E2BConfig) {
    this.apiKey = config.apiKey;
    this.imageId = config.imageId;
    this.domain = config.domain;
  }

  private connectionOpts(): { apiKey: string; domain?: string } {
    return {
      apiKey: this.apiKey,
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  async create(
    config: SandboxCreateConfig
  ): Promise<Result<SandboxHandle, Error>> {
    const imageId = config.imageId ?? this.imageId;
    const templateId = formatSandboxImageId(imageId);

    logger.info({ templateId, imageId }, "Creating E2B sandbox");

    let sandbox: Sandbox;
    try {
      const envVars = config.envVars ?? {};
      const hasEnvVars = Object.keys(envVars).length > 0;
      sandbox = await Sandbox.create(templateId, {
        ...this.connectionOpts(),
        envs: hasEnvVars ? envVars : undefined,
        timeoutMs: SANDBOX_LIFETIME_MS,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        ...(config.network
          ? { network: toE2BNetworkOpts(config.network) }
          : {}),
      });
    } catch (err) {
      return new Err(normalizeError(err));
    }

    logger.info(
      { sandboxId: sandbox.sandboxId, templateId },
      "E2B sandbox created"
    );

    return new Ok({ providerId: sandbox.sandboxId });
  }

  async wake(providerId: string): Promise<Result<SandboxHandle, Error>> {
    logger.info({ providerId }, "Waking E2B sandbox");

    // Sandbox.connect auto-resumes paused sandboxes.
    try {
      await Sandbox.connect(providerId, {
        ...this.connectionOpts(),
        timeoutMs: SANDBOX_LIFETIME_MS,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new Err(new SandboxNotFoundError(providerId));
      }
      return new Err(normalizeError(err));
    }

    logger.info({ providerId }, "E2B sandbox woken");

    return new Ok({ providerId });
  }

  async sleep(providerId: string): Promise<Result<void, Error>> {
    logger.info({ providerId }, "Pausing E2B sandbox");

    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.connect(providerId, this.connectionOpts());
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new Err(new SandboxNotFoundError(providerId));
      }
      return new Err(normalizeError(err));
    }

    try {
      await sandbox.betaPause();
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new Err(new SandboxNotFoundError(providerId));
      }
      return new Err(normalizeError(err));
    }

    logger.info({ providerId }, "E2B sandbox paused");

    return new Ok(undefined);
  }

  async destroy(providerId: string): Promise<Result<void, Error>> {
    logger.info({ providerId }, "Killing E2B sandbox");

    try {
      await Sandbox.kill(providerId, this.connectionOpts());
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new Err(new SandboxNotFoundError(providerId));
      }
      return new Err(normalizeError(err));
    }

    logger.info({ providerId }, "E2B sandbox killed");

    return new Ok(undefined);
  }

  async exec(
    providerId: string,
    command: string,
    opts?: ExecOptions
  ): Promise<Result<ExecResult, Error>> {
    let sandbox: Sandbox;
    try {
      sandbox = await Sandbox.connect(providerId, {
        ...this.connectionOpts(),
        timeoutMs: SANDBOX_LIFETIME_MS,
      });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return new Err(new SandboxNotFoundError(providerId));
      }
      return new Err(normalizeError(err));
    }

    try {
      const result = await sandbox.commands.run(command, {
        cwd: opts?.workingDirectory,
        envs: opts?.envVars,
        timeoutMs: opts?.timeoutMs,
      });

      return new Ok({
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    } catch (err) {
      // The E2B SDK throws CommandExitError on non-zero exit codes.
      // Normalize into a regular ExecResult so callers never see E2B types.
      if (err instanceof CommandExitError) {
        return new Ok({
          exitCode: err.exitCode,
          stdout: err.stdout,
          stderr: err.stderr,
        });
      }
      return new Err(normalizeError(err));
    }
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
