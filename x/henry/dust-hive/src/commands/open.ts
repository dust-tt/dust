import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_SCRIPTS,
  DUST_HIVE_ZELLIJ,
  MAIN_SESSION_NAME,
  getEnvFilePath,
  getServiceLogsTuiPath,
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

// Unified service logs TUI - cycles through all services in one tab
// Usage: service-logs-tui.sh <env-name>
function getServiceLogsTuiContent(): string {
  const services = ALL_SERVICES.join(" ");
  return `#!/usr/bin/env bash
# Unified service logs viewer - cycle through services with hotkeys
# Usage: service-logs-tui.sh <env-name>

ENV_NAME="\$1"
if [[ -z "\$ENV_NAME" ]]; then
  echo "Usage: service-logs-tui.sh <env-name>"
  exit 1
fi

SERVICES=(${services})
NUM_SERVICES=\${#SERVICES[@]}
CURRENT_INDEX=0
TAIL_PID=""
TAIL_LINES=500

get_log_file() {
  local service="\$1"
  echo "\$HOME/.dust-hive/envs/\$ENV_NAME/\$service.log"
}

cleanup() {
  # Reset scroll region
  printf "\\033[r"
  if [[ -n "\$TAIL_PID" ]] && kill -0 "\$TAIL_PID" 2>/dev/null; then
    kill "\$TAIL_PID" 2>/dev/null
    wait "\$TAIL_PID" 2>/dev/null
  fi
}

trap cleanup EXIT

# Get terminal dimensions
get_term_height() {
  tput lines 2>/dev/null || echo 24
}

# Draw sticky header at top of screen
draw_header() {
  local service="\${SERVICES[\$CURRENT_INDEX]}"
  local num=\$((CURRENT_INDEX + 1))
  local term_height=\$(get_term_height)

  # Save cursor, move to top, draw header, restore cursor
  printf "\\033[s"                    # Save cursor position
  printf "\\033[1;1H"                 # Move to row 1, col 1
  printf "\\033[2K"                   # Clear the line
  # Service name: bold + inverse (works across themes)
  printf "\\033[1;7m  %s  \\033[0m" "\$service"
  printf "  \\033[2m(%d/%d) [%d lines] n/p=switch +/-=lines r=restart q=stop x=exit\\033[0m" "\$num" "\$NUM_SERVICES" "\$TAIL_LINES"
  printf "\\033[u"                    # Restore cursor position
}

# Set up scroll region (leave top line for header)
setup_scroll_region() {
  local term_height=\$(get_term_height)
  printf "\\033[2;\${term_height}r"   # Set scroll region from line 2 to bottom
  printf "\\033[2;1H"                 # Move cursor to line 2
}

# Reset scroll region to full screen
reset_scroll_region() {
  printf "\\033[r"                    # Reset scroll region
}

start_tail() {
  local service="\${SERVICES[\$CURRENT_INDEX]}"
  local log_file="\$(get_log_file "\$service")"

  mkdir -p "\$(dirname "\$log_file")"
  touch "\$log_file"

  # Start tail in background with current line count
  tail -n "\$TAIL_LINES" -F "\$log_file" &
  TAIL_PID=\$!
}

stop_tail() {
  if [[ -n "\$TAIL_PID" ]] && kill -0 "\$TAIL_PID" 2>/dev/null; then
    kill "\$TAIL_PID" 2>/dev/null
    wait "\$TAIL_PID" 2>/dev/null
  fi
  TAIL_PID=""
}

switch_service() {
  stop_tail
  clear
  draw_header
  setup_scroll_region
  start_tail
}

next_service() {
  CURRENT_INDEX=$(( (CURRENT_INDEX + 1) % NUM_SERVICES ))
  switch_service
}

prev_service() {
  CURRENT_INDEX=$(( (CURRENT_INDEX - 1 + NUM_SERVICES) % NUM_SERVICES ))
  switch_service
}

restart_service() {
  local service="\${SERVICES[\$CURRENT_INDEX]}"
  stop_tail
  echo ""
  echo -e "\\033[33m[Restarting \$service...]\\033[0m"
  dust-hive restart "\$ENV_NAME" "\$service"
  echo -e "\\033[32m[\$service restarted]\\033[0m"
  sleep 1
  switch_service
}

quit_service() {
  local service="\${SERVICES[\$CURRENT_INDEX]}"
  stop_tail
  echo ""
  echo -e "\\033[33m[Stopping \$service...]\\033[0m"
  dust-hive restart "\$ENV_NAME" "\$service" --stop 2>/dev/null || \\
    pkill -f "dust-hive.*\$service" 2>/dev/null || true
  echo -e "\\033[31m[\$service stopped]\\033[0m"
  sleep 1
  switch_service
}

increase_lines() {
  if [[ \$TAIL_LINES -lt 10000 ]]; then
    TAIL_LINES=\$((TAIL_LINES + 500))
  fi
  switch_service
}

decrease_lines() {
  if [[ \$TAIL_LINES -gt 100 ]]; then
    TAIL_LINES=\$((TAIL_LINES - 500))
  fi
  switch_service
}

# Initial draw
clear
draw_header
setup_scroll_region
start_tail

# Main input loop - read single chars
while true; do
  # Read with timeout so we can check if tail died
  if read -r -s -n 1 -t 1 key 2>/dev/null; then
    case "\$key" in
      n|N|j) next_service ;;
      p|P|k) prev_service ;;
      r|R) restart_service ;;
      q|Q) quit_service ;;
      x|X) exit 0 ;;
      c|C) switch_service ;;  # clear/refresh
      +|=) increase_lines ;;
      -|_) decrease_lines ;;
    esac
  fi

  # Restart tail if it died
  if [[ -n "\$TAIL_PID" ]] && ! kill -0 "\$TAIL_PID" 2>/dev/null; then
    start_tail
  fi
done
`;
}

export async function ensureServiceLogsTui(): Promise<string> {
  await mkdir(DUST_HIVE_SCRIPTS, { recursive: true });
  const scriptPath = getServiceLogsTuiPath();
  await Bun.write(scriptPath, getServiceLogsTuiContent());
  // Make executable
  const proc = Bun.spawn(["chmod", "+x", scriptPath], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return scriptPath;
}

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
