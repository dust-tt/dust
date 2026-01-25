import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "../logger";
import { getInstallInstructions as getPlatformInstallInstructions } from "../platform";
import { restoreTerminal } from "../prompt";
import { ALL_SERVICES, type ServiceName } from "../services";
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
 * Base directory for zellij layouts
 */
const ZELLIJ_LAYOUT_DIR = join(homedir(), ".dust-hive", "zellij");

/**
 * URL for the zellij-switch plugin (used for session switching from within zellij)
 */
const ZELLIJ_SWITCH_PLUGIN_URL =
  "https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm";

/**
 * Escape a string for use in KDL (Zellij's config format)
 */
function kdlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Get the user's default shell
 */
function getUserShell(): string {
  return process.env["SHELL"] ?? "/bin/bash";
}

/**
 * Strip ANSI escape codes from a string
 */
function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI escape code stripping
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// Shared tab template for all zellij layouts (ensures consistent tab bar)
const TAB_TEMPLATE = `    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }`;

// Compact tab template: bar at bottom with session name, mode, and tabs
const TAB_TEMPLATE_COMPACT = `    default_tab_template {
        children
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
    }`;

/**
 * Zellij multiplexer adapter implementation
 */
export class ZellijAdapter implements MultiplexerAdapter {
  readonly type: MultiplexerType = "zellij";

  // ============================================================
  // Session Lifecycle
  // ============================================================

  async listSessions(): Promise<string[]> {
    const proc = Bun.spawn(["zellij", "list-sessions"], {
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
      .map((line) => stripAnsi(line).trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/)[0])
      .filter((name): name is string => name?.startsWith(SESSION_PREFIX) ?? false);
  }

  async sessionExists(sessionName: string): Promise<boolean> {
    const proc = Bun.spawn(["zellij", "list-sessions"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const sessions = await new Response(proc.stdout).text();
    await proc.exited;

    return sessions
      .split("\n")
      .map((line) => stripAnsi(line).trim())
      .filter((line) => line.length > 0)
      .map((line) => line.split(/\s+/)[0])
      .some((name) => name === sessionName);
  }

  async createSessionInBackground(sessionName: string, layoutPath: string): Promise<void> {
    logger.info(`Creating zellij session '${sessionName}' in background...`);

    const proc = Bun.spawn(
      [
        "zellij",
        "attach",
        sessionName,
        "--create-background",
        "options",
        "--default-layout",
        layoutPath,
      ],
      {
        stdin: "ignore",
        stdout: "ignore",
        stderr: "pipe",
      }
    );
    await proc.exited;

    logger.success(`Session '${sessionName}' created successfully.`);
  }

  async createAndAttachSession(sessionName: string, layoutPath: string): Promise<void> {
    logger.info(`Creating new zellij session '${sessionName}'...`);

    // Ensure terminal is fully restored before spawning zellij
    restoreTerminal();

    const proc = Bun.spawn(
      ["zellij", "--session", sessionName, "--new-session-with-layout", layoutPath],
      {
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      }
    );

    await proc.exited;
  }

  async attachSession(sessionName: string): Promise<void> {
    logger.info(`Attaching to existing session '${sessionName}'...`);

    // Ensure terminal is fully restored before spawning zellij
    restoreTerminal();

    const proc = Bun.spawn(["zellij", "attach", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  }

  async killSession(sessionName: string): Promise<void> {
    const proc = Bun.spawn(["zellij", "kill-session", sessionName], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  async deleteSession(sessionName: string): Promise<void> {
    const proc = Bun.spawn(["zellij", "delete-session", sessionName, "--force"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    await proc.exited;
  }

  // ============================================================
  // Nested Session Handling
  // ============================================================

  isInsideMultiplexer(): boolean {
    return process.env["ZELLIJ"] !== undefined;
  }

  getCurrentSessionName(): string | null {
    return process.env["ZELLIJ_SESSION_NAME"] ?? null;
  }

  async switchToSession(sessionName: string): Promise<void> {
    logger.info(`Switching to session '${sessionName}'...`);

    const proc = Bun.spawn(
      ["zellij", "pipe", "--plugin", ZELLIJ_SWITCH_PLUGIN_URL, "--", `--session ${sessionName}`],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
    );
    await proc.exited;
  }

  // ============================================================
  // Layout Generation
  // ============================================================

  generateLayout(config: LayoutConfig): string {
    const { envName, worktreePath, envShPath, compact, unifiedLogs, warmCommand, initialCommand } =
      config;
    const shellPath = getUserShell();

    // Build the shell command that runs in the main tab
    const shellCommand = initialCommand
      ? `source ${shellQuote(envShPath)} && ${initialCommand}; exec ${shellQuote(shellPath)}`
      : `source ${shellQuote(envShPath)} && exec ${shellQuote(shellPath)}`;

    // Generate warm tab if requested
    const warmTab = warmCommand
      ? `    tab name="warm" {
        pane {
            cwd "${kdlEscape(worktreePath)}"
            command "bash"
            args "-c" "${kdlEscape(warmCommand)}"
            start_suspended false
        }
    }`
      : "";

    // Generate logs tabs based on mode
    let logsTabs: string;
    if (unifiedLogs) {
      // Single unified logs tab using dust-hive logs -i
      logsTabs = `    tab name="logs" {
        pane {
            command "dust-hive"
            args "logs" "${kdlEscape(envName)}" "-i"
            start_suspended true
        }
    }`;
    } else {
      // Individual service tabs (default)
      logsTabs = ALL_SERVICES.map((service) => this.generateServiceTab(envName, service)).join(
        "\n\n"
      );
    }

    // When compact mode is enabled, use bottom bar; otherwise use top bar
    const tabTemplate = compact ? TAB_TEMPLATE_COMPACT : TAB_TEMPLATE;

    return `layout {
${tabTemplate}

    tab name="${kdlEscape(envName)}" focus=true {
        pane {
            cwd "${kdlEscape(worktreePath)}"
            command "bash"
            args "-c" "${kdlEscape(shellCommand)}"
            start_suspended false
        }
    }

${warmTab ? `${warmTab}\n\n` : ""}${logsTabs}
}
`;
  }

  generateMainLayout(config: MainLayoutConfig): string {
    const { repoRoot, compact } = config;
    const shellPath = getUserShell();
    const tabTemplate = compact ? TAB_TEMPLATE_COMPACT : TAB_TEMPLATE;

    return `layout {
${tabTemplate}

    tab name="main" focus=true {
        pane {
            cwd "${kdlEscape(repoRoot)}"
            command "${kdlEscape(shellPath)}"
            start_suspended false
        }
    }

    tab name="temporal" {
        pane {
            command "dust-hive"
            args "temporal" "logs"
            start_suspended true
        }
    }
}
`;
  }

  private generateServiceTab(envName: string, service: ServiceName): string {
    const tabName = TAB_NAMES[service];
    return `    tab name="${tabName}" {
        pane {
            command "dust-hive"
            args "logs" "${kdlEscape(envName)}" "${kdlEscape(service)}" "-f"
            start_suspended true
        }
    }`;
  }

  getLayoutDirectory(): string {
    return ZELLIJ_LAYOUT_DIR;
  }

  getLayoutPath(filename: string): string {
    return join(ZELLIJ_LAYOUT_DIR, filename);
  }

  async writeLayout(content: string, path: string): Promise<void> {
    await mkdir(ZELLIJ_LAYOUT_DIR, { recursive: true });
    await Bun.write(path, content);
  }

  // ============================================================
  // Prerequisites
  // ============================================================

  async checkInstalled(): Promise<InstallCheckResult> {
    try {
      const proc = Bun.spawn(["zellij", "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const output = await new Response(proc.stdout).text();
      await proc.exited;

      if (proc.exitCode === 0) {
        const version = output.trim().split("\n")[0] ?? "Unknown";
        return { ok: true, version };
      }
      return { ok: false, error: "zellij command failed" };
    } catch {
      return { ok: false, error: "zellij not found" };
    }
  }

  getInstallInstructions(): string {
    return getPlatformInstallInstructions("zellij");
  }
}
