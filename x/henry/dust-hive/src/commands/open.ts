import { mkdir } from "node:fs/promises";
import { withEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_SCRIPTS,
  DUST_HIVE_ZELLIJ,
  getEnvFilePath,
  getWatchScriptPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../lib/paths";
import { Ok } from "../lib/result";
import { ALL_SERVICES, type ServiceName } from "../lib/services";

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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function kdlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function getUserShell(): string {
  // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket notation for index signatures
  return process.env["SHELL"] ?? "zsh";
}

// Watch script content - written to ~/.dust-hive/scripts/watch-logs.sh
const WATCH_SCRIPT_CONTENT = `#!/bin/bash
# Log watcher with Ctrl+C menu for restart/clear/quit
# Usage: watch-logs.sh <env-name> <service>

ENV_NAME="\$1"
SERVICE="\$2"

if [[ -z "\$ENV_NAME" || -z "\$SERVICE" ]]; then
  echo "Usage: watch-logs.sh <env-name> <service>"
  exit 1
fi

LOG_FILE="\$HOME/.dust-hive/envs/\$ENV_NAME/\$SERVICE.log"

mkdir -p "\$(dirname "\$LOG_FILE")"
touch "\$LOG_FILE"

# Trap SIGINT to prevent script from exiting on Ctrl+C
trap '' SIGINT

show_menu() {
  echo ""
  echo -e "\\033[100m [\$SERVICE] r=restart | c=clear | q=quit | Enter=resume \\033[0m"
  read -r -n 1 cmd
  echo ""

  case "\$cmd" in
    r|R)
      echo -e "\\033[33m[Restarting \$SERVICE...]\\033[0m"
      dust-hive restart "\$ENV_NAME" "\$SERVICE"
      echo -e "\\033[32m[\$SERVICE restarted]\\033[0m"
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
  echo -e "\\033[100m [\$SERVICE] Ctrl+C for menu \\033[0m"
  echo ""
  # Run tail in a subshell that doesn't ignore SIGINT
  (trap - SIGINT; exec tail -n 500 -F "\$LOG_FILE") || true
  show_menu
done
`;

async function ensureWatchScript(): Promise<string> {
  await mkdir(DUST_HIVE_SCRIPTS, { recursive: true });
  const scriptPath = getWatchScriptPath();
  await Bun.write(scriptPath, WATCH_SCRIPT_CONTENT);
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
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:compact-bar"
        }
        children
    }

    tab name="shell" focus=true {
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
}

export const openCommand = withEnvironment("open", async (env, options: OpenOptions = {}) => {
  const worktreePath = getWorktreeDir(env.name);
  const envShPath = getEnvFilePath(env.name);
  const sessionName = `dust-hive-${env.name}`;

  // Ensure watch script exists
  const watchScriptPath = await ensureWatchScript();

  // Check if session already exists
  const checkProc = Bun.spawn(["zellij", "list-sessions"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const sessions = await new Response(checkProc.stdout).text();
  await checkProc.exited;

  // Strip ANSI codes for comparison
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional for ANSI escape code stripping
  const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, "");
  const sessionExists = sessions
    .split("\n")
    .map((line) => stripAnsi(line).trim())
    .filter((line) => line.length > 0)
    .map((line) => line.split(/\s+/)[0])
    .some((name) => name === sessionName);

  if (sessionExists) {
    // Attach to existing session
    logger.info(`Attaching to existing session '${sessionName}'...`);

    const proc = Bun.spawn(["zellij", "attach", sessionName], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  } else {
    // Create new session with layout
    logger.info(`Creating new zellij session '${sessionName}'...`);

    const layoutPath = await writeLayout(
      env.name,
      worktreePath,
      envShPath,
      watchScriptPath,
      options.warmCommand
    );

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
