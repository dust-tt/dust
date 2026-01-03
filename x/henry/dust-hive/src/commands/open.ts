import { mkdir } from "node:fs/promises";
import { getEnvironment } from "../lib/environment";
import { logger } from "../lib/logger";
import {
  DUST_HIVE_ZELLIJ,
  getEnvFilePath,
  getLogPath,
  getWorktreeDir,
  getZellijLayoutPath,
} from "../lib/paths";

// Generate zellij layout for an environment
function generateLayout(envName: string, worktreePath: string, envShPath: string): string {
  const sdkLog = getLogPath(envName, "sdk");
  const frontLog = getLogPath(envName, "front");
  const coreLog = getLogPath(envName, "core");
  const oauthLog = getLogPath(envName, "oauth");
  const connectorsLog = getLogPath(envName, "connectors");
  const frontWorkersLog = getLogPath(envName, "front-workers");

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
            command "bash"
            args "-c" "source ${envShPath} && exec bash"
        }
    }

    tab name="sdk" {
        pane {
            command "tail"
            args "-F" "${sdkLog}"
        }
    }

    tab name="front" {
        pane {
            command "tail"
            args "-F" "${frontLog}"
        }
    }

    tab name="core" {
        pane {
            command "tail"
            args "-F" "${coreLog}"
        }
    }

    tab name="oauth" {
        pane {
            command "tail"
            args "-F" "${oauthLog}"
        }
    }

    tab name="connectors" {
        pane {
            command "tail"
            args "-F" "${connectorsLog}"
        }
    }

    tab name="workers" {
        pane {
            command "tail"
            args "-F" "${frontWorkersLog}"
        }
    }
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

export async function openCommand(args: string[]): Promise<void> {
  const name = args[0];

  if (!name) {
    logger.error("Usage: dust-hive open NAME");
    process.exit(1);
  }

  // Get environment
  const env = await getEnvironment(name);
  if (!env) {
    logger.error(`Environment '${name}' not found`);
    process.exit(1);
  }

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

  const sessionExists = sessions.split("\n").some((line) => line.trim().startsWith(sessionName));

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

    const proc = Bun.spawn(["zellij", "--session", sessionName, "--layout", layoutPath], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    });

    await proc.exited;
  }
}
