import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_ZELLIJ,
  MAIN_SESSION_NAME,
  getEnvFilePath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../lib/paths";
import { restoreTerminal } from "../lib/prompt";
import { Ok } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";
import { shellQuote } from "../lib/shell";

function kdlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getUserShell(): string {
  return process.env["SHELL"] ?? "/bin/bash";
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

// Tab display names (shorter names for better zellij tab bar)
const TAB_NAMES: Record<ServiceName, string> = {
  sdk: "sdk",
  front: "front",
  core: "core",
  oauth: "oauth",
  connectors: "connectors",
  "front-workers": "workers",
};

interface LayoutOptions {
  warmCommand?: string | undefined;
  initialCommand?: string | undefined;
  compact?: boolean | undefined;
  unifiedLogs?: boolean | undefined;
}

// Generate a single service tab using dust-hive logs command
function generateServiceTab(envName: string, service: ServiceName): string {
  const tabName = TAB_NAMES[service];
  return `    tab name="${tabName}" {
        pane {
            command "dust-hive"
            args "logs" "${kdlEscape(envName)}" "${kdlEscape(service)}" "-f"
            start_suspended true
        }
    }`;
}

// Generate zellij layout for an environment
function generateLayout(
  envName: string,
  worktreePath: string,
  envShPath: string,
  options: LayoutOptions = {}
): string {
  const { warmCommand, initialCommand, compact, unifiedLogs } = options;
  const shellPath = getUserShell();
  // If initialCommand is provided, run it first then drop to shell on exit
  const shellCommand = initialCommand
    ? `source ${shellQuote(envShPath)} && ${initialCommand}; exec ${shellQuote(shellPath)}`
    : `source ${shellQuote(envShPath)} && exec ${shellQuote(shellPath)}`;
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
    logsTabs = ALL_SERVICES.map((service) => generateServiceTab(envName, service)).join("\n\n");
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

// Write layout and return path
async function writeLayout(
  envName: string,
  worktreePath: string,
  envShPath: string,
  options: LayoutOptions = {}
): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });

  const layoutPath = getZellijLayoutPath();
  const content = generateLayout(envName, worktreePath, envShPath, options);
  await Bun.write(layoutPath, content);

  return layoutPath;
}

interface OpenOptions {
  warmCommand?: string | undefined;
  noAttach?: boolean | undefined;
  initialCommand?: string | undefined;
  compact?: boolean | undefined;
  unifiedLogs?: boolean | undefined;
}

// Check if a zellij session exists
async function checkSessionExists(sessionName: string): Promise<boolean> {
  const checkProc = Bun.spawn(["zellij", "list-sessions"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const sessions = await new Response(checkProc.stdout).text();
  await checkProc.exited;

  // Strip ANSI codes for comparison
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI escape code stripping
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");
  return sessions
    .split("\n")
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0])
    .some((name) => name === sessionName);
}

// Create a zellij session in background (does not attach)
async function createSessionInBackground(sessionName: string, layoutPath: string): Promise<void> {
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

export const openCommand = withEnvironment("open", async (env, options: OpenOptions = {}) => {
  const worktreePath = getWorktreeDir(env.name);
  const envShPath = getEnvFilePath(env.name);
  const sessionName = `dust-hive-${env.name}`;

  // Detect if running inside zellij to avoid nesting
  const inZellij = process.env["ZELLIJ"] !== undefined;
  const currentSession = process.env["ZELLIJ_SESSION_NAME"];

  // If inside zellij and trying to attach, use session manager instead
  if (inZellij && !options.noAttach) {
    // If already in the target session, nothing to do
    if (currentSession === sessionName) {
      logger.info(`Already in session '${sessionName}'`);
      return Ok(undefined);
    }

    // Ensure session exists (create in background if needed)
    const sessionExists = await checkSessionExists(sessionName);
    if (!sessionExists) {
      const layoutPath = await writeLayout(env.name, worktreePath, envShPath, {
        warmCommand: options.warmCommand,
        initialCommand: options.initialCommand,
        compact: options.compact,
        unifiedLogs: options.unifiedLogs,
      });
      await createSessionInBackground(sessionName, layoutPath);
    }

    // Switch to target session using zellij-switch plugin
    logger.info(`Switching to session '${sessionName}'...`);
    const switchProc = Bun.spawn(
      [
        "zellij",
        "pipe",
        "--plugin",
        "https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm",
        "--",
        `--session ${sessionName}`,
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
    );
    await switchProc.exited;

    return Ok(undefined);
  }

  // Check if session already exists
  const sessionExists = await checkSessionExists(sessionName);

  if (sessionExists) {
    if (options.noAttach) {
      logger.info(`Session '${sessionName}' already exists.`);
      logger.info(`Use 'dust-hive open ${env.name}' to attach.`);
      return Ok(undefined);
    }

    // Attach to existing session
    logger.info(`Attaching to existing session '${sessionName}'...`);

    // Ensure terminal is fully restored before spawning zellij
    restoreTerminal();

    const proc = Bun.spawn(["zellij", "attach", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  } else {
    // Create new session with layout
    const layoutPath = await writeLayout(env.name, worktreePath, envShPath, {
      warmCommand: options.warmCommand,
      initialCommand: options.initialCommand,
      compact: options.compact,
      unifiedLogs: options.unifiedLogs,
    });

    if (options.noAttach) {
      await createSessionInBackground(sessionName, layoutPath);
      logger.info(`Use 'dust-hive open ${env.name}' to attach.`);
      return Ok(undefined);
    }

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

  return Ok(undefined);
});

// Generate layout for main session (repo root + temporal logs)
function generateMainLayout(repoRoot: string, compact?: boolean): string {
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

async function writeMainLayout(repoRoot: string, compact?: boolean): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });
  const layoutPath = join(DUST_HIVE_ZELLIJ, "main-layout.kdl");
  const content = generateMainLayout(repoRoot, compact);
  await Bun.write(layoutPath, content);
  return layoutPath;
}

interface MainSessionOptions {
  attach?: boolean;
  compact?: boolean | undefined;
}

// Open the main session (for managed services mode)
export async function openMainSession(
  repoRoot: string,
  options: MainSessionOptions = {}
): Promise<void> {
  const sessionName = MAIN_SESSION_NAME;

  const inZellij = process.env["ZELLIJ"] !== undefined;
  const currentSession = process.env["ZELLIJ_SESSION_NAME"];

  // Check if session exists
  const sessionExists = await checkSessionExists(sessionName);

  if (inZellij && options.attach) {
    if (currentSession === sessionName) {
      logger.info(`Already in session '${sessionName}'`);
      return;
    }

    if (!sessionExists) {
      const layoutPath = await writeMainLayout(repoRoot, options.compact);
      await createSessionInBackground(sessionName, layoutPath);
    }

    // Switch to session using zellij-switch plugin
    logger.info(`Switching to session '${sessionName}'...`);
    const switchProc = Bun.spawn(
      [
        "zellij",
        "pipe",
        "--plugin",
        "https://github.com/mostafaqanbaryan/zellij-switch/releases/download/0.2.1/zellij-switch.wasm",
        "--",
        `--session ${sessionName}`,
      ],
      { stdin: "ignore", stdout: "ignore", stderr: "ignore" }
    );
    await switchProc.exited;
    return;
  }

  if (sessionExists) {
    if (!options.attach) {
      logger.info(`Main session '${sessionName}' already exists.`);
      return;
    }

    logger.info(`Attaching to main session '${sessionName}'...`);
    restoreTerminal();
    const proc = Bun.spawn(["zellij", "attach", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });
    await proc.exited;
  } else {
    const layoutPath = await writeMainLayout(repoRoot, options.compact);

    if (!options.attach) {
      await createSessionInBackground(sessionName, layoutPath);
      logger.info(`Main session '${sessionName}' created.`);
      return;
    }

    logger.info(`Creating main session '${sessionName}'...`);
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
}
