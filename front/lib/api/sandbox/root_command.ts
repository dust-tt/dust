const SHELL_BUILTIN_COMMANDS = new Set([
  ":",
  ".",
  "[",
  "[[",
  "{",
  "}",
  "alias",
  "bg",
  "break",
  "builtin",
  "case",
  "cd",
  "command",
  "continue",
  "declare",
  "do",
  "done",
  "echo",
  "elif",
  "else",
  "esac",
  "exec",
  "exit",
  "export",
  "false",
  "fg",
  "fi",
  "for",
  "function",
  "hash",
  "if",
  "in",
  "jobs",
  "local",
  "popd",
  "printf",
  "pushd",
  "pwd",
  "read",
  "readonly",
  "return",
  "set",
  "shift",
  "source",
  "test",
  "then",
  "times",
  "trap",
  "true",
  "type",
  "ulimit",
  "umask",
  "unalias",
  "unset",
  "until",
  "wait",
  "while",
]);

const COMMAND_SEPARATORS = new Set(["&&", "||", "|", ";", "\n", "$("]);
const COMMAND_EXPECTING_KEYWORDS = new Set(["then", "do", "else", "elif"]);
type ExecutableWrapper = "command" | "env" | "exec" | "nohup" | "timeout";

function stripHeredocBodies(command: string): string {
  const lines = command.split("\n");
  const output: string[] = [];
  let pendingDelimiters: string[] = [];

  for (const line of lines) {
    if (pendingDelimiters.length > 0) {
      pendingDelimiters = pendingDelimiters.filter(
        (delimiter) => line.trim() !== delimiter
      );
      continue;
    }

    output.push(line);

    const delimiterMatches = line.matchAll(
      /<<-?\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))/g
    );
    for (const match of delimiterMatches) {
      const delimiter = match[1] ?? match[2] ?? match[3];
      if (delimiter) {
        pendingDelimiters.push(delimiter);
      }
    }
  }

  return output.join("\n");
}

function stripQuotedStrings(command: string): string {
  let stripped = "";
  let quote: "'" | '"' | undefined;

  for (let i = 0; i < command.length; i++) {
    const char = command[i];

    if (quote) {
      if (char === "\\" && quote === '"' && i + 1 < command.length) {
        stripped += "  ";
        i++;
        continue;
      }
      if (char === quote) {
        quote = undefined;
        stripped += " ";
        continue;
      }
      stripped += char === "\n" ? "\n" : " ";
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      stripped += " ";
      continue;
    }

    stripped += char;
  }

  return stripped;
}

function stripComments(command: string): string {
  return command
    .split("\n")
    .map((line) => line.replace(/(^|[ \t])#.*/, ""))
    .join("\n");
}

function tokenizeShell(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let commandSubstitutionDepth = 0;

  const flush = () => {
    if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  };

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    const next = command[i + 1];

    if (char === "$" && next === "(") {
      flush();
      tokens.push("$(");
      commandSubstitutionDepth++;
      i++;
      continue;
    }

    if (char === ")" && commandSubstitutionDepth > 0) {
      flush();
      tokens.push(")");
      commandSubstitutionDepth--;
      continue;
    }

    if (char === "\n") {
      flush();
      tokens.push("\n");
      continue;
    }

    if (/\s/.test(char)) {
      flush();
      continue;
    }

    if (char === "&" && next === "&") {
      flush();
      tokens.push("&&");
      i++;
      continue;
    }

    if (char === "|" && next === "|") {
      flush();
      tokens.push("||");
      i++;
      continue;
    }

    if (char === "|" || char === ";") {
      flush();
      tokens.push(char);
      continue;
    }

    current += char;
  }

  flush();
  return tokens;
}

function isEnvironmentAssignment(token: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

function isRedirection(token: string): boolean {
  return /^(\d+)?([<>]|>>|<<|<>|>&|<&|&>|&>>)/.test(token);
}

function isAllowedCommandWord(token: string): boolean {
  return token.startsWith("/") || SHELL_BUILTIN_COMMANDS.has(token);
}

function getExecutableWrapper(token: string): ExecutableWrapper | undefined {
  switch (token) {
    case "command":
      return "command";
    case "/bin/env":
    case "/usr/bin/env":
      return "env";
    case "exec":
      return "exec";
    case "/bin/nohup":
    case "/usr/bin/nohup":
      return "nohup";
    case "/bin/timeout":
    case "/usr/bin/timeout":
      return "timeout";
    default:
      return undefined;
  }
}

function getBareExecutableViolations(tokens: string[]): string[] {
  const violations: string[] = [];
  let expectsCommand = true;
  let skipForHeader = false;
  let skipCaseBody = false;
  let expectFindExecCommand = false;
  let executableWrapper: ExecutableWrapper | undefined;
  let skipNextExecOptionValue = false;
  let skipNextEnvOptionValue = false;
  let timeoutSawDuration = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (COMMAND_SEPARATORS.has(token)) {
      expectsCommand = true;
      executableWrapper = undefined;
      skipNextExecOptionValue = false;
      skipNextEnvOptionValue = false;
      timeoutSawDuration = false;
      continue;
    }

    if (token === ")") {
      continue;
    }

    if (skipForHeader) {
      if (token === "do") {
        skipForHeader = false;
        expectsCommand = true;
      }
      continue;
    }

    if (skipCaseBody) {
      if (token === "esac") {
        skipCaseBody = false;
        expectsCommand = false;
      }
      continue;
    }

    if (expectFindExecCommand) {
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      expectFindExecCommand = false;
      continue;
    }

    if (token === "-exec" || token === "-execdir") {
      expectFindExecCommand = true;
      continue;
    }

    if (COMMAND_EXPECTING_KEYWORDS.has(token)) {
      expectsCommand = true;
      continue;
    }

    if (executableWrapper === "command") {
      if (token === "-v" || token === "-V") {
        executableWrapper = undefined;
        continue;
      }
      if (token.startsWith("-")) {
        continue;
      }
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      continue;
    }

    if (executableWrapper === "env") {
      if (skipNextEnvOptionValue) {
        skipNextEnvOptionValue = false;
        continue;
      }
      if (token === "-u" || token === "--unset") {
        skipNextEnvOptionValue = true;
        continue;
      }
      if (token.startsWith("-") || isEnvironmentAssignment(token)) {
        continue;
      }
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      continue;
    }

    if (executableWrapper === "exec") {
      if (skipNextExecOptionValue) {
        skipNextExecOptionValue = false;
        continue;
      }
      if (token === "-a") {
        skipNextExecOptionValue = true;
        continue;
      }
      if (token.startsWith("-")) {
        continue;
      }
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      continue;
    }

    if (executableWrapper === "nohup") {
      if (token.startsWith("-")) {
        continue;
      }
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      continue;
    }

    if (executableWrapper === "timeout") {
      if (token.startsWith("-")) {
        continue;
      }
      if (!timeoutSawDuration) {
        timeoutSawDuration = true;
        continue;
      }
      if (!isAllowedCommandWord(token)) {
        violations.push(token);
      }
      executableWrapper = getExecutableWrapper(token);
      continue;
    }

    if (!expectsCommand) {
      continue;
    }

    if (isEnvironmentAssignment(token) || isRedirection(token)) {
      continue;
    }

    if (token === "for") {
      skipForHeader = true;
      expectsCommand = false;
      continue;
    }

    if (token === "case") {
      skipCaseBody = true;
      expectsCommand = false;
      continue;
    }

    if (!isAllowedCommandWord(token)) {
      violations.push(token);
    }
    executableWrapper = getExecutableWrapper(token);
    expectsCommand = false;
  }

  return [...new Set(violations)];
}

export function getBareRootCommandExecutables(command: string): string[] {
  const commandWithoutHeredocs = stripHeredocBodies(command);
  const commandWithoutQuotedStrings = stripQuotedStrings(
    commandWithoutHeredocs
  );
  const commandWithoutComments = stripComments(commandWithoutQuotedStrings);

  return getBareExecutableViolations(tokenizeShell(commandWithoutComments));
}

export function assertRootCommandUsesAbsoluteExecutables(
  command: string
): void {
  const bareExecutables = getBareRootCommandExecutables(command);

  if (bareExecutables.length > 0) {
    throw new Error(
      [
        "Sandbox root commands must use absolute executable paths.",
        `Bare executable(s): ${bareExecutables.join(", ")}.`,
      ].join(" ")
    );
  }
}
