#!/usr/bin/env tsx
import { parseArgs } from "node:util";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import { Sandbox } from "e2b";

async function main() {
  // Find the -- separator
  const separatorIndex = process.argv.indexOf("--");
  let commandParts: string[] = [];

  if (separatorIndex !== -1) {
    commandParts = process.argv.slice(separatorIndex + 1);
  }

  // Parse only the args before -- (or all if no --)
  const argsEndIndex =
    separatorIndex !== -1 ? separatorIndex : process.argv.length;
  const { values } = parseArgs({
    args: process.argv.slice(2, argsEndIndex),
    options: {
      sandboxId: {
        type: "string",
        short: "s",
      },
      user: {
        type: "string",
        short: "u",
        default: "root",
      },
      interactive: {
        type: "boolean",
        short: "i",
        default: undefined,
      },
      tty: {
        type: "boolean",
        short: "t",
        default: undefined,
      },
    },
  });

  const sandboxId = values.sandboxId;
  const user = values.user;
  const command = commandParts.length > 0 ? commandParts.join(" ") : "bash";

  // kubectl-style behavior: -i and -t flags
  // If not explicitly set, infer from terminal state
  const wantsInteractive = values.interactive ?? process.stdin.isTTY;
  const wantsTTY = values.tty ?? process.stdout.isTTY;
  const useInteractiveMode = wantsInteractive && wantsTTY;

  if (!sandboxId) {
    logger.error("Error: --sandboxId (-s) is required");
    logger.error(
      "Usage: sandbox_exec.ts -s <sandbox-id> [-u <user>] [-it] [-- command]"
    );
    logger.error(
      "  -i, --interactive    Keep stdin open (default: auto-detect)"
    );
    logger.error(
      "  -t, --tty            Allocate a pseudo-TTY (default: auto-detect)"
    );
    process.exit(1);
  }

  logger.info(
    {
      sandboxId,
      command,
      user,
      mode: useInteractiveMode ? "interactive" : "non-interactive",
    },
    "Connecting to sandbox"
  );

  const e2bConfig = config.getE2BSandboxConfig();
  const sandbox = await Sandbox.connect(sandboxId, {
    apiKey: e2bConfig.apiKey,
    domain: e2bConfig.domain,
  });

  if (useInteractiveMode) {
    await runInteractive(sandbox, command, user);
  } else {
    await runNonInteractive(sandbox, command, user);
  }
}

async function runInteractive(sandbox: Sandbox, command: string, user: string) {
  const stdin = process.stdin;
  const stdout = process.stdout;

  const cols = stdout.columns || 80;
  const rows = stdout.rows || 24;

  const pty = await sandbox.pty.create({
    cols,
    rows,
    user,
    onData: (data: Uint8Array) => {
      stdout.write(Buffer.from(data));
    },
    timeoutMs: 0, // CRITICAL FIX: 0 = indefinite timeout for interactive sessions
  });

  stdin.setRawMode(true);
  stdin.setEncoding("utf8");

  stdin.on("data", (data: Buffer) => {
    void sandbox.pty.sendInput(pty.pid, new Uint8Array(data));
  });

  const handleResize = () => {
    void sandbox.pty.resize(pty.pid, {
      cols: stdout.columns || 80,
      rows: stdout.rows || 24,
    });
  };

  stdout.on("resize", handleResize);

  const cleanup = () => {
    if (stdin.isTTY) {
      stdin.setRawMode(false);
    }
    stdout.off("resize", handleResize);
  };

  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });

  if (command !== "bash") {
    // Wait for bash prompt to be ready before sending commands
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Send command to the shell, then exit when it completes
    await sandbox.pty.sendInput(
      pty.pid,
      new TextEncoder().encode(command + "; exit\n")
    );
  }

  try {
    await pty.wait();
  } finally {
    cleanup();
  }

  process.exit(pty.exitCode ?? 0);
}

async function runNonInteractive(
  sandbox: Sandbox,
  command: string,
  user: string
) {
  const result = await sandbox.commands.run(command, { user });

  if (result.stdout) {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith("\n")) {
      process.stdout.write("\n");
    }
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
    if (!result.stderr.endsWith("\n")) {
      process.stderr.write("\n");
    }
  }

  if (result.exitCode !== 0) {
    logger.error(
      { exitCode: result.exitCode },
      "Command exited with non-zero code"
    );
    process.exit(result.exitCode);
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
