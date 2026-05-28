import { shellEscape } from "@app/lib/api/sandbox/shell";

const ROOT_COMMAND_BRAND: unique symbol = Symbol("RootCommand");

export type RootCommandArg = string | number;
type RootCommandShellForm = "simple" | "compound";

export interface RootCommand {
  readonly [ROOT_COMMAND_BRAND]: true;
  readonly command: string;
  readonly shellForm: RootCommandShellForm;
  readonly unsafeReason?: string;
}

function makeRootCommand(
  command: string,
  shellForm: RootCommandShellForm,
  unsafeReason?: string
): RootCommand {
  return {
    [ROOT_COMMAND_BRAND]: true,
    command,
    shellForm,
    ...(unsafeReason ? { unsafeReason } : {}),
  };
}

function renderArg(arg: RootCommandArg): string {
  if (typeof arg === "number") {
    return String(arg);
  }

  return /^[A-Za-z0-9_./:,@%+=-]+$/.test(arg) ? arg : shellEscape(arg);
}

function assertAbsoluteExecutable(executable: string): void {
  if (!executable.startsWith("/")) {
    throw new Error(`Root command executable must be absolute: ${executable}`);
  }
  if (!/^\/[A-Za-z0-9_./+-]+$/.test(executable)) {
    throw new Error(`Root command executable path is not safe: ${executable}`);
  }
}

function assertNonEmptyReason(reason: string): void {
  if (reason.trim().length === 0) {
    throw new Error("Unsafe root shell commands must include a reason.");
  }
}

function assertNonEmptyShellCommand(command: string): void {
  if (command.trim().length === 0) {
    throw new Error("Unsafe root shell commands must not be empty.");
  }
}

function assertPositiveIntegerTimeout(timeoutSeconds: number): void {
  if (!Number.isSafeInteger(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error(
      `Root command timeout must be a positive integer: ${timeoutSeconds}`
    );
  }
}

function mergeUnsafeReasons(
  commands: readonly RootCommand[]
): string | undefined {
  const reasons = commands
    .flatMap((command) => (command.unsafeReason ? [command.unsafeReason] : []))
    .filter((reason, index, reasons) => reasons.indexOf(reason) === index);

  return reasons.length > 0 ? reasons.join("; ") : undefined;
}

function renderCommandOperand(command: RootCommand): string {
  if (command.shellForm === "simple") {
    return command.command;
  }

  return `/bin/bash --noprofile --norc -c ${shellEscape(command.command)}`;
}

function commandWithPrefix(prefix: string, command: RootCommand): RootCommand {
  return makeRootCommand(
    `${prefix} ${renderCommandOperand(command)}`,
    "simple",
    command.unsafeReason
  );
}

export function renderRootCommand(command: RootCommand): string {
  return command.command;
}

export const rootCommand = {
  exec(executable: string, args: readonly RootCommandArg[] = []): RootCommand {
    assertAbsoluteExecutable(executable);
    return makeRootCommand(
      [executable, ...args.map(renderArg)].join(" "),
      "simple"
    );
  },

  and(commands: readonly RootCommand[]): RootCommand {
    if (commands.length === 0) {
      throw new Error("Root command list must not be empty.");
    }

    return makeRootCommand(
      commands.map(renderCommandOperand).join(" && "),
      "compound",
      mergeUnsafeReasons(commands)
    );
  },

  env(command: RootCommand, opts: { unset: readonly string[] }): RootCommand {
    const unsetArgs = opts.unset.flatMap((key) => ["-u", key]);
    return commandWithPrefix(
      renderRootCommand(rootCommand.exec("/usr/bin/env", unsetArgs)),
      command
    );
  },

  nohup(command: RootCommand): RootCommand {
    return commandWithPrefix("/usr/bin/nohup", command);
  },

  timeout(command: RootCommand, timeoutSeconds: number): RootCommand {
    assertPositiveIntegerTimeout(timeoutSeconds);
    return commandWithPrefix(`/usr/bin/timeout ${timeoutSeconds}`, command);
  },

  redirectStdout(
    command: RootCommand,
    path: string,
    opts: { stderrToStdout?: boolean } = {}
  ): RootCommand {
    return makeRootCommand(
      `${renderCommandOperand(command)} >${shellEscape(path)}${opts.stderrToStdout ? " 2>&1" : ""}`,
      "simple",
      command.unsafeReason
    );
  },

  stderrToStdout(command: RootCommand): RootCommand {
    return makeRootCommand(
      `${renderCommandOperand(command)} 2>&1`,
      "simple",
      command.unsafeReason
    );
  },

  background(command: RootCommand): RootCommand {
    return makeRootCommand(
      `${renderCommandOperand(command)} &`,
      "compound",
      command.unsafeReason
    );
  },

  unsafeShell(command: string, reason: string): RootCommand {
    assertNonEmptyShellCommand(command);
    assertNonEmptyReason(reason);
    return makeRootCommand(command, "compound", reason);
  },
};
