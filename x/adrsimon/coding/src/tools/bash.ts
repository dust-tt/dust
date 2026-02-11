import { execa } from "execa";

import type { Tool, ToolContext } from "./index.js";

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_OUTPUT_LENGTH = 30000;

export function bashTool(context: ToolContext): Tool {
  return {
    name: "bash",
    description:
      "Execute a bash command. Returns stdout, stderr, and exit code. " +
      "Commands run in the project working directory. " +
      "Use for running tests, builds, git operations, and other system commands.",
    inputSchema: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The bash command to execute.",
        },
        timeout_ms: {
          type: "number",
          description: `Timeout in milliseconds. Default: ${DEFAULT_TIMEOUT_MS}.`,
        },
        cwd: {
          type: "string",
          description: "Working directory for the command. Default: project root.",
        },
      },
      required: ["command"],
    },
    async execute(input) {
      const command = input.command as string;
      const timeoutMs = (input.timeout_ms as number) ?? DEFAULT_TIMEOUT_MS;
      const cwd = (input.cwd as string) ?? context.cwd;

      try {
        const result = await execa("bash", ["-c", command], {
          cwd,
          timeout: timeoutMs,
          stdio: "pipe",
          buffer: true,
          env: {
            ...process.env,
            TERM: "dumb",
            NO_COLOR: "1",
          },
        });

        let output = "";
        if (result.stdout) {
          output += result.stdout;
        }
        if (result.stderr) {
          output += (output ? "\n\nSTDERR:\n" : "STDERR:\n") + result.stderr;
        }

        if (output.length > MAX_OUTPUT_LENGTH) {
          output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n\n[output truncated]";
        }

        if (!output) {
          output = "(no output)";
        }

        return `Exit code: ${result.exitCode}\n${output}`;
      } catch (err: unknown) {
        if (
          err &&
          typeof err === "object" &&
          "stdout" in err &&
          "stderr" in err
        ) {
          const execErr = err as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
            timedOut?: boolean;
            signal?: string;
          };

          if (execErr.timedOut) {
            return `Error: Command timed out after ${timeoutMs}ms`;
          }

          let output = "";
          if (execErr.stdout) {
            output += execErr.stdout;
          }
          if (execErr.stderr) {
            output += (output ? "\n\nSTDERR:\n" : "STDERR:\n") + execErr.stderr;
          }

          if (output.length > MAX_OUTPUT_LENGTH) {
            output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n\n[output truncated]";
          }

          return `Exit code: ${execErr.exitCode ?? 1}\n${output || "(no output)"}`;
        }

        const message = err instanceof Error ? err.message : String(err);
        return `Error executing command: ${message}`;
      }
    },
  };
}
