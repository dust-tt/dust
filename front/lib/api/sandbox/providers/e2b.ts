import { getLocalAccountPrivilegeHardeningCommand } from "@app/lib/api/sandbox/hardening";
import {
  formatSandboxImageId,
  type NetworkPolicy,
} from "@app/lib/api/sandbox/image/types";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  SandboxCreateConfig,
  SandboxHandle,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";
import {
  SandboxNotFoundError,
  traceSandboxOperation,
} from "@app/lib/api/sandbox/provider";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { CommandExitError, NotFoundError, Sandbox } from "e2b";

const ONE_HOUR_MS = 60 * 60 * 1_000;

/**
 * E2B Pro hard-caps sandbox lifetime at 24h — passing a larger value errors
 * out at create/connect time. Long-running sessions need to recreate/wake on
 * expiry; the reaper still owns the inactivity-based teardown below this
 * ceiling.
 */
const SANDBOX_LIFETIME_MS = 24 * ONE_HOUR_MS;

/** Timeout for individual API calls to E2B (create, connect, etc.). */
const REQUEST_TIMEOUT_MS = 30_000;
const LOCAL_ACCOUNT_HARDENING_TIMEOUT_MS = 120_000;

const ALL_TRAFFIC = "0.0.0.0/0";

interface E2BNetworkOpts {
  allowOut?: string[];
  denyOut?: string[];
  allowPublicTraffic?: boolean;
}

function toE2BNetworkOpts(policy: NetworkPolicy): E2BNetworkOpts {
  switch (policy.mode) {
    case "deny_all":
      return {
        allowOut: policy.allowlist ? [...policy.allowlist] : [],
        denyOut: [ALL_TRAFFIC],
        allowPublicTraffic: false,
      };
    case "allow_all":
      // Fully unrestricted: lift the public-traffic block too. Only reachable
      // in dev via SBX_DEV_UNRESTRICTED_EGRESS.
      return { allowPublicTraffic: true };
    default:
      assertNever(policy.mode);
  }
}

interface E2BConfig {
  apiKey: string;
  domain: string | undefined;
}

// Send command stdin via the E2B Commands API rather than baking it into argv.
// The command is started in the background with stdin open; if anything goes
// wrong on the SDK round-trip, we kill the handle so we don't leak a running
// command on the VM until the lifetime cap kicks in.
async function runWithStdin(
  sandbox: Sandbox,
  command: string,
  commandOpts: {
    cwd?: string;
    envs?: Record<string, string>;
    timeoutMs?: number;
    user?: string;
  },
  stdin: string | Uint8Array
) {
  const handle = await sandbox.commands.run(command, {
    ...commandOpts,
    background: true,
    stdin: true,
  });

  try {
    // Per-RPC timeout, not the command's total runtime — clamping to the
    // overall timeoutMs would block sendStdin/closeStdin for the entire
    // duration of a long-running command on the very first network hiccup.
    await sandbox.commands.sendStdin(handle.pid, stdin, {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
    await sandbox.commands.closeStdin(handle.pid, {
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    });
    return await handle.wait();
  } catch (err) {
    try {
      await handle.kill();
    } catch {
      // Best-effort: caller already has a real error to surface.
    }
    throw err;
  }
}

/**
 * E2B implementation of SandboxProvider.
 *
 * All E2B-specific logic is isolated here — the rest of the codebase only
 * sees the SandboxProvider interface.
 */
export class E2BSandboxProvider implements SandboxProvider {
  private readonly apiKey: string;
  private readonly domain: string | undefined;

  constructor(config: E2BConfig) {
    this.apiKey = config.apiKey;
    this.domain = config.domain;
  }

  private connectionOpts(): { apiKey: string; domain?: string } {
    return {
      apiKey: this.apiKey,
      ...(this.domain ? { domain: this.domain } : {}),
    };
  }

  async create(
    config: SandboxCreateConfig,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<SandboxHandle, Error>> {
    if (!config.imageId) {
      throw new Error(
        "imageId is required in SandboxCreateConfig. Use getSandboxImage().toCreateConfig() to get the config."
      );
    }
    const imageId = formatSandboxImageId(config.imageId);

    return traceSandboxOperation(
      "create",
      async () => {
        const templateId = imageId;

        logger.info(
          { templateId, imageId: config.imageId },
          "Creating E2B sandbox"
        );

        let sandbox: Sandbox;
        try {
          const envVars = config.envVars ?? {};
          const hasEnvVars = Object.keys(envVars).length > 0;
          sandbox = await Sandbox.create(templateId, {
            ...this.connectionOpts(),
            envs: hasEnvVars ? envVars : undefined,
            timeoutMs: SANDBOX_LIFETIME_MS,
            requestTimeoutMs: REQUEST_TIMEOUT_MS,
            network: config.network
              ? toE2BNetworkOpts(config.network)
              : { allowPublicTraffic: false },
          });
        } catch (err) {
          return new Err(normalizeError(err));
        }

        try {
          const hardeningResult = await sandbox.commands.run(
            getLocalAccountPrivilegeHardeningCommand(),
            {
              timeoutMs: LOCAL_ACCOUNT_HARDENING_TIMEOUT_MS,
              user: "root",
            }
          );
          if (hardeningResult.exitCode !== 0) {
            throw new Error(
              `E2B sandbox local account hardening failed: ${hardeningResult.stderr}`
            );
          }
        } catch (err) {
          try {
            await Sandbox.kill(sandbox.sandboxId, this.connectionOpts());
          } catch (killErr) {
            logger.error(
              {
                err: normalizeError(killErr),
                sandboxId: sandbox.sandboxId,
                templateId,
              },
              "Failed to kill E2B sandbox after local account hardening failure"
            );
          }
          return new Err(normalizeError(err));
        }

        logger.info(
          { sandboxId: sandbox.sandboxId, templateId },
          "E2B sandbox created"
        );

        return new Ok({ providerId: sandbox.sandboxId });
      },
      {
        image_id: imageId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async wake(
    providerId: string,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<SandboxHandle, Error>> {
    return traceSandboxOperation(
      "wake",
      async () => {
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
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async sleep(
    providerId: string,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<void, Error>> {
    return traceSandboxOperation(
      "sleep",
      async () => {
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
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async destroy(
    providerId: string,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<void, Error>> {
    return traceSandboxOperation(
      "destroy",
      async () => {
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
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async exec(
    providerId: string,
    command: string,
    execOpts: ExecOptions | undefined,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<ExecResult, Error>> {
    return traceSandboxOperation(
      "exec",
      async () => {
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
          const commandOpts = {
            cwd: execOpts?.workingDirectory,
            envs: execOpts?.envVars,
            timeoutMs: execOpts?.timeoutMs,
            user: execOpts?.user,
          };
          const stdin = execOpts?.stdin;
          const result =
            stdin === undefined
              ? await sandbox.commands.run(command, commandOpts)
              : await runWithStdin(sandbox, command, commandOpts, stdin);

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
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async writeFile(
    providerId: string,
    path: string,
    data: ArrayBuffer,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<void, Error>> {
    return traceSandboxOperation(
      "writeFile",
      async () => {
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
          // Note: this creates the necessary directories if missing.
          await sandbox.files.write(path, data);
        } catch (err) {
          return new Err(normalizeError(err));
        }

        return new Ok(undefined);
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }

  async readFile(
    _providerId: string,
    _path: string,
    _tracingOpts: { workspaceId: string }
  ): Promise<Buffer> {
    throw new Error("readFile is not implemented yet.");
  }

  async listFiles(
    providerId: string,
    path: string,
    opts: { recursive?: boolean } | undefined,
    tracingOpts: { workspaceId: string }
  ): Promise<FileEntry[]> {
    return traceSandboxOperation(
      "listFiles",
      async () => {
        let sandbox: Sandbox;
        try {
          sandbox = await Sandbox.connect(providerId, {
            ...this.connectionOpts(),
            timeoutMs: SANDBOX_LIFETIME_MS,
          });
        } catch (err) {
          if (err instanceof NotFoundError) {
            throw new SandboxNotFoundError(providerId);
          }
          throw normalizeError(err);
        }

        const entries = await sandbox.files.list(path, {
          depth: opts?.recursive ? 10 : 1,
        });

        return entries.map((e) => ({
          path: e.path,
          size: e.size,
          isDirectory: e.type === "dir",
        }));
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
  }
}
