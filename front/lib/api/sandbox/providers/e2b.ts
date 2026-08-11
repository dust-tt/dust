import {
  getLocalAccountPrivilegeHardeningCommand,
  getSandboxServicePathHardeningCommand,
  SANDBOX_AGENT_PROXIED_SAFE_PATH,
  SANDBOX_AGENT_SAFE_PATH,
  SANDBOX_AGENT_SERVICE_HOME,
  SANDBOX_ROOT_SAFE_PATH,
} from "@app/lib/api/sandbox/hardening";
import type { NetworkPolicy } from "@app/lib/api/sandbox/image/types";
import { formatSandboxImageId } from "@app/lib/api/sandbox/image/types";
import { traceSandboxStartupPhase } from "@app/lib/api/sandbox/instrumentation";
import type {
  ExecOptions,
  ExecResult,
  FileEntry,
  RootExecOptions,
  SandboxCreateConfig,
  SandboxExecUser,
  SandboxHandle,
  SandboxProvider,
} from "@app/lib/api/sandbox/provider";
import {
  isSandboxExecUser,
  SandboxExecTimeoutError,
  SandboxNotFoundError,
  traceSandboxOperation,
} from "@app/lib/api/sandbox/provider";
import type { RootCommand } from "@app/lib/api/sandbox/root_command";
import {
  renderRootCommand,
  rootCommand,
} from "@app/lib/api/sandbox/root_command";
import { shellEscape } from "@app/lib/api/sandbox/shell";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CommandHandle } from "e2b";
import { CommandExitError, NotFoundError, Sandbox, TimeoutError } from "e2b";

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

/**
 * The E2B SDK's own command timeout when the caller passes no `timeoutMs`
 * (`Commands.defaultProcessConnectionTimeout`). Only used to report the budget a command that
 * timed out without an explicit `timeoutMs` was actually running under.
 */
const E2B_DEFAULT_COMMAND_TIMEOUT_MS = 60_000;
const LOCAL_ACCOUNT_HARDENING_TIMEOUT_MS = 120_000;

/**
 * How long a connected sandbox handle is reused before reconnecting.
 *
 * This is also the refresh interval for the sandbox's provider-side expiry: every connect passes
 * `timeoutMs: SANDBOX_LIFETIME_MS`, so reconnecting on a fixed interval keeps any sandbox we are
 * still working with from reaching its deadline, the way a connect on every operation used to.
 */
const CONNECTION_TTL_MS = 5 * 60 * 1_000;

/**
 * Cap on cached handles. A handle is small (connection config plus a fetch transport, no socket
 * of its own), so this only needs to stay ahead of the sandboxes one process talks to.
 */
const MAX_CACHED_CONNECTIONS = 1_000;

/**
 * Environment variable carrying inline stdin. The wrapper below unexports it before handing over
 * to the command, so the payload reaches the workload on its stdin and not in its environment.
 */
const INLINE_STDIN_ENV = "DUST_EXEC_STDIN";

/**
 * Cap on inline stdin, kept under a pipe's 64KiB buffer so `printf` writes the whole payload and
 * exits rather than blocking on a command that never reads it. Also well under the kernel's
 * per-environment-string limit (MAX_ARG_STRLEN, 128KiB). Larger payloads take the streamed path.
 */
const MAX_INLINE_STDIN_BYTES = 32 * 1_024;

const ALL_TRAFFIC = "0.0.0.0/0";

function getRootSafeSandboxCommand(command: RootCommand): string {
  return [
    `PATH=${shellEscape(SANDBOX_ROOT_SAFE_PATH)}`,
    "HOME=/root",
    "BASH_ENV=/dev/null",
    "ENV=/dev/null",
    "/bin/bash --noprofile --norc -c",
    shellEscape(renderRootCommand(command)),
  ].join(" ");
}

function getNonRootSafeSandboxCommand(
  command: string,
  user: SandboxExecUser
): string {
  const { home, path } =
    user === "agent"
      ? {
          home: SANDBOX_AGENT_SERVICE_HOME,
          path: SANDBOX_AGENT_SAFE_PATH,
        }
      : {
          home: "/home/agent-proxied",
          path: SANDBOX_AGENT_PROXIED_SAFE_PATH,
        };

  return [
    `PATH=${shellEscape(path)}`,
    `HOME=${shellEscape(home)}`,
    "BASH_ENV=/dev/null",
    "ENV=/dev/null",
    "/bin/bash --noprofile --norc -c",
    shellEscape(command),
  ].join(" ");
}

function getNonRootOuterEnvironment(
  envVars: Record<string, string> | undefined
): Record<string, string> {
  return {
    ...envVars,
    // The E2B SDK starts an outer login shell before evaluating `command`.
    // Keep that shell away from attacker-writable homes and startup hooks; the
    // inner clean shell above restores the workload user's intended HOME/PATH.
    PATH: SANDBOX_AGENT_SAFE_PATH,
    HOME: SANDBOX_AGENT_SERVICE_HOME,
    BASH_ENV: "/dev/null",
    ENV: "/dev/null",
  };
}

function getLocalAccountHardeningError(result: ExecResult): Error {
  const output = [result.stderr, result.stdout]
    .filter((text) => text.length > 0)
    .join("\n");
  return new Error(
    [
      `E2B sandbox local account hardening failed with exit code ${result.exitCode}`,
      output,
    ]
      .filter((message) => message.length > 0)
      .join(":\n")
  );
}

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

interface E2BCommandOpts {
  cwd?: string;
  envs?: Record<string, string>;
  stdin?: string | Uint8Array;
  allowStdinInEnvironment?: boolean;
  timeoutMs?: number;
  user?: string;
}

type StdinDelivery =
  | { mode: "none" }
  | { mode: "inline"; payload: string }
  | { mode: "streamed"; payload: string | Uint8Array };

/**
 * How stdin reaches the command.
 *
 * envd has no way to carry stdin in the start request: it takes a boolean saying stdin will be
 * open, after which `sendStdin` and `closeStdin` are two more sequential calls to the sandbox.
 * Handing the payload over through the environment collapses all three into the single start
 * call, but only a caller that has opted in gets it: `Commands.list` reports the environment of
 * every running command, so a secret has to keep the streamed path. Binary and oversized payloads
 * do too, because an environment value can hold neither NUL nor an unbounded string.
 */
function getStdinDelivery(
  stdin: string | Uint8Array | undefined,
  allowStdinInEnvironment: boolean
): StdinDelivery {
  if (stdin === undefined) {
    return { mode: "none" };
  }
  if (
    !allowStdinInEnvironment ||
    typeof stdin !== "string" ||
    stdin.includes("\0") ||
    Buffer.byteLength(stdin, "utf8") > MAX_INLINE_STDIN_BYTES
  ) {
    return { mode: "streamed", payload: stdin };
  }

  return { mode: "inline", payload: stdin };
}

/**
 * Feeds inline stdin to `command` from the environment.
 *
 * `exec` and the process substitution are both load bearing, and a pipeline is NOT a valid
 * substitute. envd tracks the single pid it started and signals only that pid when a command
 * exceeds its timeout. Piping into the command would leave envd holding the wrapper shell while
 * the workload ran on as a grandchild, so a timed out command would keep running in the sandbox
 * after we gave up on it (verified against a live sandbox). Replacing the wrapper with the
 * command keeps the pid envd owns the pid that matters.
 *
 * `exec`, `unset` and `printf` are bash builtins, so nothing here resolves through PATH (SEC3),
 * and passing the payload as an argument to `%s` keeps it out of the format string. The payload
 * is copied to a shell variable and unexported before the `exec`, so it is absent from the
 * environment of the command and of everything it spawns.
 */
function withInlineStdin(command: string): string {
  return [
    `__dust_stdin="$${INLINE_STDIN_ENV}"`,
    `unset ${INLINE_STDIN_ENV}`,
    // printf's own stderr is dropped: the only thing it can report is a write error against a
    // command that exited without reading its stdin, which is not a failure of that command.
    `exec /bin/bash --noprofile --norc -c ${shellEscape(command)} < <(printf '%s' "$__dust_stdin" 2>/dev/null)`,
  ].join("; ");
}

/**
 * The single start call that carries the command, its environment, and, when it fits, its stdin.
 *
 * Always started in the background: waiting is the caller's job, because only the start is safe
 * to retry on a new connection.
 */
function buildStartRequest(
  command: string,
  commandOpts: E2BCommandOpts,
  stdin: StdinDelivery
) {
  const opts = {
    cwd: commandOpts.cwd,
    envs: commandOpts.envs,
    timeoutMs: commandOpts.timeoutMs,
    user: commandOpts.user,
    background: true as const,
  };

  switch (stdin.mode) {
    case "none":
      return { command, opts };
    case "inline":
      return {
        command: withInlineStdin(command),
        opts: {
          ...opts,
          envs: { ...commandOpts.envs, [INLINE_STDIN_ENV]: stdin.payload },
        },
      };
    case "streamed":
      // Passing `stdin: false` explicitly is rejected by envd versions that predate the option,
      // so it is only ever set on the path that needs envd to hold stdin open.
      return { command, opts: { ...opts, stdin: true as const } };
    default:
      return assertNever(stdin);
  }
}

// Sends command stdin over the E2B Commands API for payloads that cannot be inlined. The command
// is started with stdin open; if anything goes wrong on the SDK round-trip, we kill the handle so
// we don't leak a running command on the VM until the lifetime cap kicks in.
async function sendStdinAndWait(
  sandbox: Sandbox,
  handle: CommandHandle,
  stdin: string | Uint8Array
) {
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
    if (err instanceof NotFoundError) {
      // The process can exit between `run` returning its handle and the stdin
      // RPC reaching E2B. The handle consumes process events from startup, so
      // waiting recovers the actual exit code and output instead of replacing
      // them with a misleading "process with pid ... not found" error.
      return await handle.wait();
    }

    try {
      await handle.kill();
    } catch {
      // Best-effort: caller already has a real error to surface.
    }
    throw err;
  }
}

interface CachedConnection {
  // Held as a promise so concurrent operations on one sandbox share a single connect.
  sandbox: Promise<Sandbox>;
  expiresAtMs: number;
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

  /**
   * Connected sandbox handles, keyed by provider id.
   *
   * `Sandbox.connect` is a control-plane POST to E2B that every operation used to pay before it
   * could address the sandbox at all — around 100ms from our region, on top of the call that does
   * the actual work. The handle it returns stays valid for the sandbox's lifetime, so we keep it.
   * The provider is a per-process singleton, which makes this cache per-process too: no handle,
   * and therefore no sandbox access token, is shared or persisted anywhere.
   */
  private readonly connections = new Map<string, CachedConnection>();

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

  private hasFreshConnection(providerId: string): boolean {
    const existing = this.connections.get(providerId);

    return existing !== undefined && existing.expiresAtMs > Date.now();
  }

  /**
   * Returns a handle for `providerId`, reusing a cached one while it is fresh.
   *
   * `entry` is the cache entry the handle came from, or null when this call opened it. That both
   * says whether a retry is worth attempting (a handle we just opened and that already failed
   * will fail the same way again) and identifies exactly which entry to evict if it does.
   */
  private async getConnection(
    providerId: string
  ): Promise<{ sandbox: Sandbox; entry: CachedConnection | null }> {
    const existing = this.connections.get(providerId);
    if (existing && existing.expiresAtMs > Date.now()) {
      try {
        return { sandbox: await existing.sandbox, entry: existing };
      } catch (err) {
        this.dropConnection(providerId, existing);
        throw err;
      }
    }

    return { sandbox: await this.openConnection(providerId), entry: null };
  }

  private async openConnection(providerId: string): Promise<Sandbox> {
    const entry: CachedConnection = {
      // Translated here rather than at each call site so that callers can tell a sandbox that is
      // gone from a NotFoundError raised by the operation itself, such as reading a missing file.
      sandbox: Sandbox.connect(providerId, {
        ...this.connectionOpts(),
        timeoutMs: SANDBOX_LIFETIME_MS,
      }).catch((err: unknown) => {
        throw err instanceof NotFoundError
          ? new SandboxNotFoundError(providerId)
          : normalizeError(err);
      }),
      expiresAtMs: Date.now() + CONNECTION_TTL_MS,
    };
    // Delete before setting so the entry moves to the end of the map's insertion order, which is
    // what makes the eviction below drop the least recently opened connection.
    this.connections.delete(providerId);
    this.connections.set(providerId, entry);
    this.evictConnections();

    try {
      return await entry.sandbox;
    } catch (err) {
      this.dropConnection(providerId, entry);
      throw err;
    }
  }

  // Only drops `entry` when it is still the cached one: a concurrent caller may already have
  // replaced a failed handle with a working one.
  private dropConnection(providerId: string, entry?: CachedConnection): void {
    if (!entry || this.connections.get(providerId) === entry) {
      this.connections.delete(providerId);
    }
  }

  private evictConnections(): void {
    if (this.connections.size <= MAX_CACHED_CONNECTIONS) {
      return;
    }

    const nowMs = Date.now();
    for (const [providerId, entry] of this.connections) {
      if (entry.expiresAtMs <= nowMs) {
        this.connections.delete(providerId);
      }
    }

    // Map iterates in insertion order, so this drops the connections opened longest ago first.
    for (const providerId of this.connections.keys()) {
      if (this.connections.size <= MAX_CACHED_CONNECTIONS) {
        break;
      }
      this.connections.delete(providerId);
    }
  }

  /**
   * Runs `op` against the sandbox, optionally retrying it once on a freshly connected handle.
   *
   * A handle does not survive the sandbox being paused or recreated. `sleep` and `destroy` drop
   * it, so what is left is the sandbox disappearing underneath us; rather than probe for that on
   * every call, the operation is allowed to fail and reconnect, and `Sandbox.connect` resumes a
   * paused sandbox the way the connect-every-time path did.
   *
   * `retryOnStaleConnection` must only be set for an operation that is safe to run twice, which
   * running a command is NOT: the SDK aborts `Commands.start` on its own request timeout, and
   * that timeout can fire after envd has already forked the process, so a throw there does not
   * prove the command never ran. Commands therefore drop the connection and surface the error,
   * exactly as they did when every call connected first, and the next call reconnects.
   */
  private async withConnection<T>(
    providerId: string,
    op: (sandbox: Sandbox) => Promise<T>,
    { retryOnStaleConnection }: { retryOnStaleConnection: boolean }
  ): Promise<T> {
    const { sandbox, entry } = await this.getConnection(providerId);

    try {
      return await op(sandbox);
    } catch (err) {
      // envd answering "not found" means the connection is healthy and the thing the operation
      // named is what is missing, so there is nothing to reconnect for. A connect that hit a
      // missing sandbox cannot land here: openConnection turns that into SandboxNotFoundError.
      if (err instanceof NotFoundError) {
        throw err;
      }

      // Otherwise stop handing this connection to the next caller. Reconnecting costs one round
      // trip; continuing to use a handle that just failed can cost every call after it. Scoped to
      // the entry we actually used, so that when a batch of calls fails together, the first one
      // to reconnect is not evicted again by each of its peers.
      this.dropConnection(providerId, entry ?? undefined);
      if (entry === null || !retryOnStaleConnection) {
        throw err;
      }

      logger.info(
        { providerId, err: normalizeError(err) },
        "Cached E2B sandbox connection failed, reconnecting"
      );

      return op(await this.openConnection(providerId));
    }
  }

  private async killSandboxAfterLocalAccountHardeningFailure(
    sandboxId: string,
    templateId: string
  ): Promise<void> {
    try {
      await Sandbox.kill(sandboxId, this.connectionOpts());
    } catch (killErr) {
      logger.error(
        {
          err: normalizeError(killErr),
          sandboxId,
          templateId,
        },
        "Failed to kill E2B sandbox after local account hardening failure"
      );
    }
  }

  private async runCommand(
    providerId: string,
    command: string,
    commandOpts: E2BCommandOpts,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<ExecResult, Error>> {
    const stdin = getStdinDelivery(
      commandOpts.stdin,
      commandOpts.allowStdinInEnvironment ?? false
    );
    const start = buildStartRequest(command, commandOpts, stdin);

    return traceSandboxOperation(
      "exec",
      async () => {
        let sandbox: Sandbox;
        let handle: CommandHandle;
        try {
          ({ sandbox, handle } = await this.withConnection(
            providerId,
            async (connected) => ({
              sandbox: connected,
              handle: await connected.commands.run(start.command, start.opts),
            }),
            // A command may have started even when starting it reported failure.
            { retryOnStaleConnection: false }
          ));
        } catch (err) {
          if (err instanceof SandboxNotFoundError) {
            return new Err(err);
          }
          return new Err(normalizeError(err));
        }

        try {
          const result =
            stdin.mode === "streamed"
              ? await sendStdinAndWait(sandbox, handle, stdin.payload)
              : await handle.wait();

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
          // The SDK throws TimeoutError when the command runs past its `timeoutMs`. Keep the
          // classification (and the budget) instead of erasing it into a generic Error whose
          // message carries SDK advice ("pass 'timeoutMs'") that only this file could act on.
          if (err instanceof TimeoutError) {
            return new Err(
              new SandboxExecTimeoutError(
                commandOpts.timeoutMs ?? E2B_DEFAULT_COMMAND_TIMEOUT_MS
              )
            );
          }
          return new Err(normalizeError(err));
        }
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
        // Both known before the operation runs, and both are what a rollout needs to read: how
        // often a command reuses a connection, and how often stdin still costs extra round trips.
        connection: this.hasFreshConnection(providerId) ? "cached" : "fresh",
        stdin_mode: stdin.mode,
      }
    );
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
          // Split out from create so the raw E2B VM-create latency is visible
          // separately from the hardening command that follows it (the two
          // share the parent sandbox.provider.create span otherwise).
          sandbox = await traceSandboxStartupPhase("provider.create_vm", () =>
            Sandbox.create(templateId, {
              ...this.connectionOpts(),
              envs: hasEnvVars ? envVars : undefined,
              timeoutMs: SANDBOX_LIFETIME_MS,
              requestTimeoutMs: REQUEST_TIMEOUT_MS,
              network: config.network
                ? toE2BNetworkOpts(config.network)
                : { allowPublicTraffic: false },
            })
          );
        } catch (err) {
          return new Err(normalizeError(err));
        }

        let hardeningResult: ExecResult;
        try {
          const result = await traceSandboxStartupPhase(
            "provider.hardening",
            () =>
              sandbox.commands.run(
                getRootSafeSandboxCommand(
                  rootCommand.unsafeShell(
                    [
                      getLocalAccountPrivilegeHardeningCommand(),
                      getSandboxServicePathHardeningCommand(),
                    ].join(" && "),
                    "create-time sandbox local account and service path hardening"
                  )
                ),
                {
                  timeoutMs: LOCAL_ACCOUNT_HARDENING_TIMEOUT_MS,
                  user: "root",
                }
              )
          );
          hardeningResult = {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
          };
        } catch (err) {
          const createError =
            err instanceof CommandExitError
              ? getLocalAccountHardeningError({
                  exitCode: err.exitCode,
                  stdout: err.stdout,
                  stderr: err.stderr,
                })
              : normalizeError(err);

          await this.killSandboxAfterLocalAccountHardeningFailure(
            sandbox.sandboxId,
            templateId
          );
          return new Err(createError);
        }

        if (hardeningResult.exitCode !== 0) {
          await this.killSandboxAfterLocalAccountHardeningFailure(
            sandbox.sandboxId,
            templateId
          );
          return new Err(getLocalAccountHardeningError(hardeningResult));
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

        // Sandbox.connect auto-resumes paused sandboxes. Always a real connect, never a cached
        // handle — a handle from before the pause is exactly what cannot be trusted here — and
        // it leaves the fresh one cached for the commands that follow the wake.
        try {
          await this.openConnection(providerId);
        } catch (err) {
          if (err instanceof SandboxNotFoundError) {
            return new Err(err);
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
        } finally {
          // Whether or not the pause reported success, any cached handle for this sandbox may now
          // point at a suspended VM.
          this.dropConnection(providerId);
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
        } finally {
          this.dropConnection(providerId);
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
    const user: unknown = execOpts?.user;
    if (
      user !== undefined &&
      (typeof user !== "string" || !isSandboxExecUser(user))
    ) {
      return new Err(
        new Error(
          user === "root"
            ? "Use execRoot() for sandbox root commands."
            : `Invalid sandbox exec user: ${String(user)}`
        )
      );
    }

    const execUser = execOpts?.user ?? "agent";

    return this.runCommand(
      providerId,
      getNonRootSafeSandboxCommand(command, execUser),
      {
        cwd: execOpts?.workingDirectory,
        envs: getNonRootOuterEnvironment(execOpts?.envVars),
        timeoutMs: execOpts?.timeoutMs,
        stdin: execOpts?.stdin,
        allowStdinInEnvironment: execOpts?.allowStdinInEnvironment,
        user: execUser,
      },
      tracingOpts
    );
  }

  async execRoot(
    providerId: string,
    command: RootCommand,
    execOpts: RootExecOptions | undefined,
    tracingOpts: { workspaceId: string }
  ): Promise<Result<ExecResult, Error>> {
    return this.runCommand(
      providerId,
      getRootSafeSandboxCommand(command),
      {
        cwd: execOpts?.workingDirectory,
        envs: execOpts?.envVars,
        timeoutMs: execOpts?.timeoutMs,
        stdin: execOpts?.stdin,
        // Deliberately not forwarded: every root command that carries stdin today is handing
        // over a token or a secrets file, and those must not appear in a process listing.
        user: "root",
      },
      tracingOpts
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
        try {
          // Note: this creates the necessary directories if missing. Safe to retry on a fresh
          // connection: a repeat writes the same bytes to the same path.
          await this.withConnection(
            providerId,
            (sandbox) => sandbox.files.write(path, data),
            // A repeat writes the same bytes to the same path.
            { retryOnStaleConnection: true }
          );
        } catch (err) {
          if (err instanceof SandboxNotFoundError) {
            return new Err(err);
          }
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
    providerId: string,
    path: string,
    tracingOpts: { workspaceId: string }
  ): Promise<Buffer> {
    return traceSandboxOperation(
      "readFile",
      async () => {
        const bytes = await this.withConnection(
          providerId,
          (sandbox) => sandbox.files.read(path, { format: "bytes" }),
          { retryOnStaleConnection: true }
        );

        return Buffer.from(bytes);
      },
      {
        provider_id: providerId,
        workspace_id: tracingOpts.workspaceId,
      }
    );
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
        const entries = await this.withConnection(
          providerId,
          (sandbox) =>
            sandbox.files.list(path, {
              depth: opts?.recursive ? 10 : 1,
            }),
          { retryOnStaleConnection: true }
        );

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
