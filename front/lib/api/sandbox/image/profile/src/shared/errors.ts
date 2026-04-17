export class ToolError extends Error {
  readonly exitCode: number;
  readonly lines: readonly string[];

  constructor(lines: readonly string[], exitCode = 1) {
    super(lines[0] ?? "Tool error");
    this.name = "ToolError";
    this.exitCode = exitCode;
    this.lines = lines;
  }
}

export function error(message: string): never {
  throw new ToolError([`Error: ${message}`]);
}

export function errorWithUsage(message: string, usage: string): never {
  throw new ToolError([
    `Error: ${message}`,
    `Usage: ${usage}`,
    "Run with --help for more information.",
  ]);
}

export function isToolError(value: unknown): value is ToolError {
  return value instanceof ToolError;
}

export function printToolError(err: ToolError): void {
  if (err.lines.length === 0) {
    return;
  }

  process.stderr.write(`${err.lines.join("\n")}\n`);
}
