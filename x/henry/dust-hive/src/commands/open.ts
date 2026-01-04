import { mkdir } from "node:fs/promises";
import { requireEnvironment } from "../lib/commands";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_ZELLIJ,
  getEnvFilePath,
  getLogPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../lib/paths";
import { Ok, type Result } from "../lib/result";
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

// Generate a single service tab
function generateServiceTab(envName: string, service: ServiceName): string {
  const logPath = getLogPath(envName, service);
  const tabName = TAB_NAMES[service];
  return `    tab name="${tabName}" {
        pane {
            command "tail"
            args "-n" "500" "-F" "${logPath}"
            start_suspended false
        }
    }`;
}

// Generate zellij layout for an environment
function generateLayout(envName: string, worktreePath: string, envShPath: string): string {
  const serviceTabs = ALL_SERVICES.map((service) => generateServiceTab(envName, service)).join(
    "\n\n"
  );

  return `layout {
    default_tab_template {
        pane size=1 borderless=true {
            plugin location="zellij:tab-bar"
        }
        children
        pane size=2 borderless=true {
            plugin location="zellij:status-bar"
        }
    }

    tab name="shell" focus=true {
        pane {
            cwd "${worktreePath}"
            command "zsh"
            args "-c" "source ${envShPath} && exec zsh"
            start_suspended false
        }
    }

${serviceTabs}
}
`;
}

// Write layout and return path
async function writeLayout(
  envName: string,
  worktreePath: string,
  envShPath: string
): Promise<string> {
  await mkdir(DUST_HIVE_ZELLIJ, { recursive: true });

  const layoutPath = getZellijLayoutPath();
  const content = generateLayout(envName, worktreePath, envShPath);
  await Bun.write(layoutPath, content);

  return layoutPath;
}

export async function openCommand(args: string[]): Promise<Result<void>> {
  const envResult = await requireEnvironment(args[0], "open");
  if (!envResult.ok) return envResult;
  const env = envResult.value;
  const name = env.name;

  const worktreePath = getWorktreeDir(name);
  const envShPath = getEnvFilePath(name);
  const sessionName = `dust-hive-${name}`;

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
    .some((line) => stripAnsi(line).startsWith(sessionName));

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

    const layoutPath = await writeLayout(name, worktreePath, envShPath);

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
}
