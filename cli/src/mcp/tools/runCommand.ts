import { z } from "zod";

import { executeCommand } from "../../utils/command.js";
import type { McpTool } from "../types/tools.js";

export class RunCommandTool implements McpTool {
  name = "run_command";
  description =
    "Execute system commands with full control over arguments, working directory, and timeout. Returns structured output with exit code, stdout, stderr, and command info. Use this for running shell commands, build scripts, tests, or any system operations.";

  inputSchema = z.object({
    command: z
      .string()
      .describe(
        "The base command to execute (e.g., 'npm', 'git', 'ls', 'python')"
      ),
    args: z
      .array(z.string())
      .optional()
      .describe(
        "Command arguments as separate array elements (e.g., ['install', '--save-dev', 'typescript'] for 'npm install --save-dev typescript')"
      ),
    cwd: z
      .string()
      .optional()
      .describe(
        "Working directory path to run command in. If not provided, uses current directory"
      ),
    timeout: z
      .number()
      .optional()
      .describe(
        "Timeout in milliseconds (default: 30000). Use higher values for long-running commands like builds or installs"
      ),
  });

  async execute({
    command,
    args = [],
    cwd,
    timeout = 30000,
  }: z.infer<typeof this.inputSchema>) {
    const cmdRes = await executeCommand(command, args, cwd, timeout, true);

    if (cmdRes.isErr()) {
      const error = cmdRes.error;
      const output = [
        `Command failed: ${
          error.command || `${command} ${args?.join(" ") || ""}`
        }`,
        `Exit code: ${error.exitCode ?? "unknown"}`,
        error.stdout && `\nSTDOUT:\n${error.stdout}`,
        error.stderr && `\nSTDERR:\n${error.stderr}`,
        error.message && `\nError: ${error.message}`,
      ]
        .filter(Boolean)
        .join("\n");

      return {
        content: [{ type: "text" as const, text: output }],
        isError: true,
      };
    }

    const result = cmdRes.value;
    const output = [
      `Command: ${result.command}`,
      `Exit code: ${result.exitCode}`,
      result.stdout && `\nSTDOUT:\n${result.stdout}`,
      result.stderr && `\nSTDERR:\n${result.stderr}`,
    ]
      .filter(Boolean)
      .join("\n");

    return {
      content: [{ type: "text" as const, text: output }],
    };
  }
}
