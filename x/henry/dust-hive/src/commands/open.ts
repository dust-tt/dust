import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_SCRIPTS,
  DUST_HIVE_ZELLIJ,
  MAIN_SESSION_NAME,
  TEMPORAL_LOG_PATH,
  getEnvFilePath,
  getWatchScriptPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../lib/paths";
import { restoreTerminal } from "../lib/prompt";
import { Ok } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";
import { shellQuote } from "../lib/shell";

// Tab display names (shorter names for better zellij tab bar)
const TAB_NAMES: Record<ServiceName, string> = {
  sdk: "sdk",
  front: "front",
  core: "core",
  oauth: "oauth",
  connectors: "connectors",
  "front-workers": "workers",
};

const tabKeys = Object.keys(TAB_NAMES) as ServiceName[];
const missingTabs = ALL_SERVICES.filter((service) => !tabKeys.includes(service));
const extraTabs = tabKeys.filter((service) => !ALL_SERVICES.includes(service));
if (missingTabs.length > 0 || extraTabs.length > 0) {
  throw new Error(
    `TAB_NAMES mismatch. Missing: ${missingTabs.join(", ") || "none"}. Extra: ${
      extraTabs.join(", ") || "none"
    }.`
  );
}

function kdlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getUserShell(): string {
  return process.env["SHELL"] ?? "zsh";
}

// Shared tab template for all zellij layouts (ensures consistent tab bar)
const TAB_TEMPLATE = `    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }`;

// Unified watch script content - handles both env services and temporal
// Usage: watch-logs.sh --temporal
//        watch-logs.sh <env-name> <service>
function getWatchScriptContent(): string {
  return `#!/bin/bash
# Log watcher with Ctrl+C menu for restart/clear/quit
# Usage: watch-logs.sh --temporal
#        watch-logs.sh <env-name> <service>

if [[ "\$1" == "--temporal" ]]; then
  # Temporal mode
  LABEL="temporal"
  LOG_FILE="${TEMPORAL_LOG_PATH}"
  RESTART_CMD="dust-hive temporal restart"
else
  # Environment service mode
  ENV_NAME="\$1"
  SERVICE="\$2"

  if [[ -z "\$ENV_NAME" || -z "\$SERVICE" ]]; then
    echo "Usage: watch-logs.sh --temporal"
    echo "       watch-logs.sh <env-name> <service>"
    exit 1
  fi

  LABEL="\$SERVICE"
  LOG_FILE="\$HOME/.dust-hive/envs/\$ENV_NAME/\$SERVICE.log"
  RESTART_CMD="dust-hive restart \\"\$ENV_NAME\\" \\"\$SERVICE\\""
fi

mkdir -p "\$(dirname "\$LOG_FILE")"
touch "\$LOG_FILE"

# Trap SIGINT to prevent script from exiting on Ctrl+C
trap '' SIGINT

show_menu() {
  echo ""
  echo -e "\\033[100m [\$LABEL] r=restart | c=clear | q=quit | Enter=resume \\033[0m"
  read -r -n 1 cmd
  echo ""

  case "\$cmd" in
    r|R)
      echo -e "\\033[33m[Restarting \$LABEL...]\\033[0m"
      eval "\$RESTART_CMD"
      echo -e "\\033[32m[\$LABEL restarted]\\033[0m"
      sleep 1
      ;;
    c|C)
      clear
      ;;
    q|Q)
      exit 0
      ;;
  esac
}

while true; do
  echo -e "\\033[100m [\$LABEL] Ctrl+C for menu \\033[0m"
  echo ""
  # Run tail in a subshell that doesn't ignore SIGINT
  (trap - SIGINT; exec tail -n 500 -F "\$LOG_FILE") || true
  show_menu
done
`;
}

async function ensureWatchScript(): Promise<string> {
  await mkdir(DUST_HIVE_SCRIPTS, { recursive: true });
  const scriptPath = getWatchScriptPath();
  await Bun.write(scriptPath, getWatchScriptContent());
  // Make executable
  const proc = Bun.spawn(["chmod", "+x", scriptPath], { stdout: "ignore", stderr: "ignore" });
  await proc.exited;
  return scriptPath;
}

// Generate a single service tab with log watching and restart menu
function generateServiceTab(
  envName: string,
  service: ServiceName,
  watchScriptPath: string
): string {
  const tabName = TAB_NAMES[service];
  return `    tab name="${tabName}" {
        pane {
            command "${kdlEscape(watchScriptPath)}"
            args "${kdlEscape(envName)}" "${kdlEscape(service)}"
            start_suspended false
        }
    }`;
}

// Generate zellij layout for an environment
function generateLayout(
  envName: string,
  worktreePath: string,
  envShPath: string,
  watchScriptPath: string,
  warmCommand?: string
): string {
  const shellPath = getUserShell();
  const shellCommand = `source ${shellQuote(envShPath)} && exec ${shellQuote(shellPath)}`;
  const warmTab = warmCommand
    ? `    tab name="warm" {
        pane {
            cwd "${kdlEscape(worktreePath)}"
            command "sh"
            args "-c" "${kdlEscape(warmCommand)}"
            start_suspended false
        }
    }`
    : "";
  const serviceTabs = ALL_SERVICES.map((service) =>
    generateServiceTab(envName, service, watchScriptPath)
  ).join("\n\n");

  return `layout {
${TAB_TEMPLATE}

    tab name="${kdlEscape(envName)}" focus=true {
        pane {
            cwd "${kdlEscape(worktreePath)}"
            command "sh"
            args "-c" "${kdlEscape(shellCommand)}"
            start_suspended false
        }
    }

${warmTab ? `${warmTab}\n\n` : ""}${serviceTabs}
}
`;
}

// Write layout and return path
async function writeLayout(
  envName: string,
  worktreePath: string,
  envShPath: string,
  watchScriptPath: string,
  warmCommand?: string
): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });

  const layoutPath = getZellijLayoutPath();
  const content = generateLayout(envName, worktreePath, envShPath, watchScriptPath, warmCommand);
  await Bun.write(layoutPath, content);

  return layoutPath;
}

interface OpenOptions {
  warmCommand?: string;
  noAttach?: boolean;
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
      const watchScriptPath = await ensureWatchScript();
      const layoutPath = await writeLayout(
        env.name,
        worktreePath,
        envShPath,
        watchScriptPath,
        options.warmCommand
      );
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

  // Ensure watch script exists
  const watchScriptPath = await ensureWatchScript();

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
    const layoutPath = await writeLayout(
      env.name,
      worktreePath,
      envShPath,
      watchScriptPath,
      options.warmCommand
    );

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
function generateMainLayout(repoRoot: string, watchScriptPath: string): string {
  const shellPath = getUserShell();

  return `layout {
${TAB_TEMPLATE}

    tab name="main" focus=true {
        pane {
            cwd "${kdlEscape(repoRoot)}"
            command "${kdlEscape(shellPath)}"
            start_suspended false
        }
    }

    tab name="temporal" {
        pane {
            command "${kdlEscape(watchScriptPath)}"
            args "--temporal"
            start_suspended false
        }
    }
}
`;
}

async function writeMainLayout(repoRoot: string, watchScriptPath: string): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });
  const layoutPath = join(DUST_HIVE_ZELLIJ, "main-layout.kdl");
  const content = generateMainLayout(repoRoot, watchScriptPath);
  await Bun.write(layoutPath, content);
  return layoutPath;
}

interface MainSessionOptions {
  attach?: boolean;
}

// Open the main session (for managed services mode)
export async function openMainSession(
  repoRoot: string,
  options: MainSessionOptions = {}
): Promise<void> {
  const sessionName = MAIN_SESSION_NAME;

  const inZellij = process.env["ZELLIJ"] !== undefined;
  const currentSession = process.env["ZELLIJ_SESSION_NAME"];

  // Ensure watch script exists (same script, will be called with --temporal)
  const watchScriptPath = await ensureWatchScript();

  // Check if session exists
  const sessionExists = await checkSessionExists(sessionName);

  if (inZellij && options.attach) {
    if (currentSession === sessionName) {
      logger.info(`Already in session '${sessionName}'`);
      return;
    }

    if (!sessionExists) {
      const layoutPath = await writeMainLayout(repoRoot, watchScriptPath);
      await createSessionInBackground(sessionName, layoutPath);
    }

    // Switch to session
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
    const layoutPath = await writeMainLayout(repoRoot, watchScriptPath);

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
