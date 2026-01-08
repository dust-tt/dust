// Platform detection and cross-platform abstractions for dust-hive
// Supports macOS (darwin) and Linux

// ============================================================================
// Platform Detection
// ============================================================================

export type PlatformName = "macos" | "linux";

export function isMacOS(): boolean {
  return process.platform === "darwin";
}

export function isLinux(): boolean {
  return process.platform === "linux";
}

export function getPlatformName(): PlatformName {
  if (isMacOS()) return "macos";
  if (isLinux()) return "linux";
  throw new Error(
    `Unsupported platform: ${process.platform}. dust-hive supports macOS and Linux only.`
  );
}

// ============================================================================
// Process Command Abstraction
// ============================================================================

/**
 * Get the command string for a running process by PID.
 * Uses platform-specific ps flags:
 * - macOS: ps -p PID -o command=
 * - Linux: ps -p PID -o cmd=
 */
export async function getProcessCommand(pid: number): Promise<string | null> {
  // macOS uses 'command=', Linux uses 'cmd=' for the full command
  const outputFormat = isMacOS() ? "command=" : "cmd=";

  const proc = Bun.spawn(["ps", "-p", String(pid), "-o", outputFormat], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const stdoutTrimmed = stdout.trim();
  const stderrTrimmed = stderr.trim();

  // Exit code 1 with no output means process not found
  if (exitCode === 1 && stdoutTrimmed === "") {
    return null;
  }

  if (exitCode !== 0) {
    throw new Error(`ps failed for pid ${pid}: ${stderrTrimmed || "unknown error"}`);
  }

  return stdoutTrimmed.length > 0 ? stdoutTrimmed : null;
}

// ============================================================================
// Port Detection Abstraction
// ============================================================================

/**
 * Get PIDs of processes listening on a specific port.
 * Uses lsof which is available on both macOS and Linux.
 * On Linux, lsof may need to be installed: sudo apt install lsof
 */
export async function getPidsOnPort(port: number): Promise<number[]> {
  const proc = Bun.spawn(["lsof", "-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  const stdoutTrimmed = stdout.trim();
  const stderrTrimmed = stderr.trim();

  // Exit code 1 with no output means no processes found
  if (exitCode === 1 && stdoutTrimmed === "") {
    return [];
  }

  if (exitCode !== 0) {
    throw new Error(`lsof failed for port ${port}: ${stderrTrimmed || "unknown error"}`);
  }

  return stdoutTrimmed
    .split("\n")
    .filter((line) => line.length > 0)
    .map((pid) => Number.parseInt(pid, 10))
    .filter((pid) => !Number.isNaN(pid));
}

// ============================================================================
// Installation Instructions
// ============================================================================

type InstallableTool = "zellij" | "temporal" | "sccache" | "lsof" | "bun" | "nvm" | "cargo";

const INSTALL_INSTRUCTIONS: Record<PlatformName, Record<InstallableTool, string>> = {
  macos: {
    zellij: "brew install zellij",
    temporal: "brew install temporal",
    sccache: "brew install sccache",
    lsof: "lsof is included with macOS",
    bun: "curl -fsSL https://bun.sh/install | bash",
    nvm: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
    cargo: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
  },
  linux: {
    zellij: "cargo install zellij (or download from https://github.com/zellij-org/zellij/releases)",
    temporal: "curl -sSf https://temporal.download/cli.sh | sh",
    sccache: "cargo install sccache",
    lsof: "sudo apt install lsof (Debian/Ubuntu) or sudo dnf install lsof (Fedora)",
    bun: "curl -fsSL https://bun.sh/install | bash",
    nvm: "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash",
    cargo: 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh',
  },
};

/**
 * Get platform-specific installation instructions for a tool.
 */
export function getInstallInstructions(tool: InstallableTool): string {
  const platform = getPlatformName();
  return INSTALL_INSTRUCTIONS[platform][tool];
}
