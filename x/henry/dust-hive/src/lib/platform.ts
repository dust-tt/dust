// Platform detection and cross-platform abstractions for dust-hive
// Supports macOS (darwin) and Linux

import { spawnSync } from "node:child_process";
import { isErrnoException } from "./errors";

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
export function getProcessCommand(pid: number): string | null {
  // macOS uses 'command=', Linux uses 'cmd=' for the full command
  const outputFormat = isMacOS() ? "command=" : "cmd=";

  const result = spawnSync("ps", ["-p", String(pid), "-o", outputFormat], {
    encoding: "utf-8",
  });

  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";

  if (result.error) {
    if (isErrnoException(result.error) && result.error.code === "ENOENT") {
      throw new Error("ps not found in PATH");
    }
    // Exit code 1 with no output means process not found
    if (result.status === 1 && stdout === "") {
      return null;
    }
    throw result.error;
  }

  // Exit code 1 with no output means process not found
  if (result.status === 1 && stdout === "") {
    return null;
  }

  if (result.status !== 0) {
    throw new Error(`ps failed for pid ${pid}: ${stderr || "unknown error"}`);
  }

  return stdout.length > 0 ? stdout : null;
}

// ============================================================================
// Port Detection Abstraction
// ============================================================================

/**
 * Get PIDs of processes listening on a specific port.
 * Uses lsof which is available on both macOS and Linux.
 * On Linux, lsof may need to be installed: sudo apt install lsof
 */
export function getPidsOnPort(port: number): number[] {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf-8",
  });

  const stdout = result.stdout?.trim() ?? "";
  const stderr = result.stderr?.trim() ?? "";

  if (result.error) {
    if (isErrnoException(result.error) && result.error.code === "ENOENT") {
      throw new Error(`lsof not found in PATH. ${getInstallInstructions("lsof")}`);
    }
    // Exit code 1 with no output means no processes found
    if (result.status === 1 && stdout === "") {
      return [];
    }
    throw result.error;
  }

  // Exit code 1 with no output means no processes found
  if (result.status === 1 && stdout === "") {
    return [];
  }

  if (result.status !== 0) {
    throw new Error(`lsof failed for port ${port}: ${stderr || "unknown error"}`);
  }

  return stdout
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
