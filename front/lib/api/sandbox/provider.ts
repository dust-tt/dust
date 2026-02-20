/**
 * Provider-agnostic sandbox abstraction.
 *
 * Every sandbox provider (E2B, etc.) must implement the SandboxProvider
 * interface. The rest of the codebase interacts with sandboxes exclusively
 * through this contract — swapping providers only requires writing a new
 * adapter.
 */

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Opaque handle returned by create() and wake().
 * Contains the provider-assigned identifier used for all subsequent operations.
 */
export interface SandboxHandle {
  providerId: string;
}

/**
 * Configuration for provisioning a new sandbox.
 */
export interface SandboxCreateConfig {
  /** Template or image identifier. Provider-specific. */
  templateId?: string;
  /** Environment variables injected at creation time. */
  envVars?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  /** Working directory for command execution. */
  workingDirectory?: string;
  /** Timeout in milliseconds. */
  timeoutMs?: number;
  /** Additional environment variables for this execution only. */
  envVars?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Filesystem
// ---------------------------------------------------------------------------

export interface FileEntry {
  path: string;
  size: number;
  isDirectory: boolean;
}

// ---------------------------------------------------------------------------
// Provider interface
// ---------------------------------------------------------------------------

/**
 * Contract that all sandbox providers must satisfy.
 *
 * Every method receives the provider-assigned `providerId` (from
 * SandboxHandle) to identify the target sandbox. Methods reject on failure.
 */
export interface SandboxProvider {
  create(config: SandboxCreateConfig): Promise<SandboxHandle>;
  wake(providerId: string): Promise<SandboxHandle>;
  sleep(providerId: string): Promise<void>;
  destroy(providerId: string): Promise<void>;

  exec(
    providerId: string,
    command: string,
    opts?: ExecOptions
  ): Promise<ExecResult>;

  writeFile(providerId: string, path: string, content: Buffer): Promise<void>;

  readFile(providerId: string, path: string): Promise<Buffer>;

  listFiles(
    providerId: string,
    path: string,
    opts?: { recursive?: boolean }
  ): Promise<FileEntry[]>;
}
