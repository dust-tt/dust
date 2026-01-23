import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger";
import { getInstallInstructions as getPlatformInstallInstructions } from "../platform";
import { ALL_SERVICES } from "../services";
import { shellQuote } from "../shell";
import type {
  InstallCheckResult,
  LayoutConfig,
  MainLayoutConfig,
  MultiplexerAdapter,
  MultiplexerType,
} from "./types";
import { SESSION_PREFIX, TAB_NAMES } from "./types";

/**
 * Base directory for tmux layout scripts
 */
const TMUX_LAYOUT_DIR = join(homedir(), ".dust-hive", "tmux");

/**
 * Get the user's default shell
 */
function getUserShell(): string {
  return process.env["SHELL"] ?? "/bin/bash";
}

/**
 * Tmux multiplexer adapter implementation
 *
 * Tmux uses shell scripts for "layouts" since it doesn't have a declarative
 * layout format like Zellij's KDL. The script creates windows and sends
 * commands to them.
 */
export class TmuxAdapter implements MultiplexerAdapter {
  readonly type: MultiplexerType = "tmux";

  // ============================================================
  // Session Lifecycle
  // ============================================================

  async listSessions(): Promise<string[]> {
    const proc = Bun.spawn(["tmux", "list-sessions", "-F", "#{session_name}"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      return [];
    }

    return output
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((name) => name.startsWith(SESSION_PREFIX));
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    const proc = Bun.spawn(["tmux", "has-session", "-t", sessionName], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
    return proc.exitCode === 0;
  }

  async createSessionInBackground(sessionName: string, layoutPath: string): Promise<void> {
    logger.info(`Creating tmux session '${sessionName}' in background...`);

    // Run the layout script which creates the session and windows
    const proc = Bun.spawn(["bash", layoutPath], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    await proc.exited;

    if (proc.exitCode !== 0) {
      throw new Error(`Failed to create tmux session: ${stderr}`);
    }

    logger.success(`Session '${sessionName}' created successfully.`);
  }

  async createAndAttachSession(sessionName: string, layoutPath: string): Promise<void> {
    logger.info(`Creating new tmux session '${sessionName}'...`);

    // First create the session in background
    await this.createSessionInBackground(sessionName, layoutPath);

    // Then attach to it
    const proc = Bun.spawn(["tmux", "attach-session", "-t", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  }

  async attachSession(sessionName: string): Promise<void> {
    logger.info(`Attaching to existing session '${sessionName}'...`);

    const proc = Bun.spawn(["tmux", "attach-session", "-t", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  }

  async killSession(sessionName: string): Promise<void> {
    const proc = Bun.spawn(["tmux", "kill-session", "-t", sessionName], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  async deleteSession(sessionName: string): Promise<void> {
    // tmux doesn't have a separate delete concept - killing is enough
    await this.killSession(sessionName);
  }

  // ============================================================
  // Nested Session Handling
  // ============================================================

  isInsideMultiplexer(): boolean {
    return process.env["TMUX"] !== undefined;
  }

  getCurrentSessionName(): string | null {
    // When inside tmux, we need to query for the current session name
    if (!this.isInsideMultiplexer()) {
      return null;
    }

    // Use synchronous approach - spawn and wait
    const proc = Bun.spawnSync(["tmux", "display-message", "-p", "#{session_name}"], {
      stdout: "pipe",
      stderr: "pipe",
    });

    if (proc.exitCode === 0) {
      return proc.stdout.toString().trim() || null;
    }
    return null;
  }

  async switchToSession(sessionName: string): Promise<void> {
    logger.info(`Switching to session '${sessionName}'...`);

    const proc = Bun.spawn(["tmux", "switch-client", "-t", sessionName], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  // ============================================================
  // Layout Generation
  // ============================================================

  generateLayout(config: LayoutConfig): string {
    const { envName, worktreePath, envShPath, unifiedLogs, warmCommand, initialCommand } = config;
    const shellPath = getUserShell();
    const sessionName = `${SESSION_PREFIX}${envName}`;
    const mainWindowName = envName;

    // Build the shell command that runs in the main window
    const shellCommand = initialCommand
      ? `source ${shellQuote(envShPath)} && ${initialCommand}; exec ${shellQuote(shellPath)}`
      : `source ${shellQuote(envShPath)} && exec ${shellQuote(shellPath)}`;

    // Use window names instead of indices to avoid base-index issues
    const lines: string[] = [
      "#!/bin/bash",
      "# Auto-generated tmux layout script for dust-hive",
      "set -e",
      "",
      `SESSION_NAME=${shellQuote(sessionName)}`,
      `WORKTREE_PATH=${shellQuote(worktreePath)}`,
      `MAIN_WINDOW=${shellQuote(mainWindowName)}`,
      "",
      "# Create the session with the main window",
      `tmux new-session -d -s "$SESSION_NAME" -n "$MAIN_WINDOW" -c "$WORKTREE_PATH"`,
      "",
      "# Run the shell command in the main window (use window name, not index)",
      `tmux send-keys -t "$SESSION_NAME:$MAIN_WINDOW" ${shellQuote(shellCommand)} Enter`,
      "",
    ];

    // Generate warm window if requested
    if (warmCommand) {
      lines.push(
        "# Create warm window",
        `tmux new-window -t "$SESSION_NAME" -n "warm" -c "$WORKTREE_PATH"`,
        `tmux send-keys -t "$SESSION_NAME:warm" ${shellQuote(warmCommand)} Enter`,
        ""
      );
    }

    // Generate logs windows based on mode
    if (unifiedLogs) {
      // Single unified logs window
      lines.push(
        "# Create unified logs window",
        `tmux new-window -t "$SESSION_NAME" -n "logs"`,
        `tmux send-keys -t "$SESSION_NAME:logs" "dust-hive logs ${shellQuote(envName)} -i" Enter`,
        ""
      );
    } else {
      // Individual service windows
      for (const service of ALL_SERVICES) {
        const tabName = TAB_NAMES[service];
        lines.push(
          `# Create ${service} logs window`,
          `tmux new-window -t "$SESSION_NAME" -n ${shellQuote(tabName)}`,
          `tmux send-keys -t "$SESSION_NAME:${tabName}" "dust-hive logs ${shellQuote(envName)} ${shellQuote(service)} -f" Enter`,
          ""
        );
      }
    }

    // Select the first window (main) by name
    lines.push(
      "# Select the main window",
      `tmux select-window -t "$SESSION_NAME:$MAIN_WINDOW"`,
      ""
    );

    return lines.join("\n");
  }

  generateMainLayout(config: MainLayoutConfig): string {
    const { repoRoot } = config;
    const shellPath = getUserShell();
    const sessionName = `${SESSION_PREFIX}main`;

    // Use window names instead of indices to avoid base-index issues
    const lines: string[] = [
      "#!/bin/bash",
      "# Auto-generated tmux layout script for dust-hive main session",
      "set -e",
      "",
      `SESSION_NAME=${shellQuote(sessionName)}`,
      `REPO_ROOT=${shellQuote(repoRoot)}`,
      "",
      "# Create the session with the main window",
      `tmux new-session -d -s "$SESSION_NAME" -n "main" -c "$REPO_ROOT"`,
      "",
      "# Start the user's shell in the main window (use window name, not index)",
      `tmux send-keys -t "$SESSION_NAME:main" ${shellQuote(`exec ${shellPath}`)} Enter`,
      "",
      "# Create temporal logs window",
      `tmux new-window -t "$SESSION_NAME" -n "temporal"`,
      `tmux send-keys -t "$SESSION_NAME:temporal" "dust-hive temporal logs" Enter`,
      "",
      "# Select the main window by name",
      `tmux select-window -t "$SESSION_NAME:main"`,
      "",
    ];

    return lines.join("\n");
  }

  getLayoutDirectory(): string {
    return TMUX_LAYOUT_DIR;
  }

  getLayoutPath(filename: string): string {
    // Replace .kdl extension with .sh for tmux
    const baseName = filename.replace(/\.kdl$/, ".sh");
    return join(TMUX_LAYOUT_DIR, baseName);
  }

  async writeLayout(content: string, path: string): Promise<void> {
    await mkdir(TMUX_LAYOUT_DIR, { recursive: true });
    await Bun.write(path, content);
    // Make the script executable
    const proc = Bun.spawn(["chmod", "+x", path], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  // ============================================================
  // Prerequisites
  // ============================================================

  async checkInstalled(): Promise<InstallCheckResult> {
    try {
      const proc = Bun.spawn(["tmux", "-V"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      if (proc.exitCode === 0) {
        const version = output.trim().split("\n")[0] ?? "Unknown";
        return { ok: true, version };
      }
      return { ok: false, error: "tmux command failed" };
    } catch {
      return { ok: false, error: "tmux not found" };
    }
  }

  getInstallInstructions(): string {
    return getPlatformInstallInstructions("tmux");
  }
}
