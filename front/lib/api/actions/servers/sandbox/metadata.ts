import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

export const SANDBOX_TOOLS_METADATA = createToolsRecord({
  execute: {
    description:
      "Execute a shell command in an isolated sandbox environment. " +
      "The sandbox is a Linux container with common tools pre-installed. " +
      "Use this for running scripts, installing packages, or executing code. " +
      "The sandbox persists for the duration of the conversation. " +
      "To start long-running processes (e.g. servers, or long running commands), use background mode. " +
      "Do NOT use shell backgrounding (& or nohup) — use the background parameter instead.",
    schema: {
      command: z
        .string()
        .describe(
          "The shell command to execute. Can be a single command or a script."
        ),
      workingDirectory: z
        .string()
        .optional()
        .describe("Working directory for command execution. Defaults to /tmp."),
      timeoutMs: z
        .number()
        .max(120000)
        .optional()
        .describe(
          "Timeout in milliseconds for command execution. Defaults to 60000, max 120000. Ignored when background is true."
        ),
      background: z
        .boolean()
        .optional()
        .describe(
          "If true, start the command in the background and return immediately with a process ID (pid). " +
            "Output (stdout/stderr) of background commands is NOT accessible directly. " +
            "You MUST redirect output to a file (e.g. `cmd > /tmp/out.log 2>&1`) to read it later."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Executing command in sandbox",
      done: "Execute command in sandbox",
    },
  },
  describe_environment: {
    description:
      "Describe the sandbox environment and list available CLI binaries and language libraries.",
    schema: {
      format: z
        .enum(["yaml", "json"])
        .optional()
        .describe("Output format (defaults to yaml)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Describing sandbox environment",
      done: "Describe sandbox environment",
    },
  },
});

export const SANDBOX_SERVER = {
  serverInfo: {
    name: "sandbox",
    version: "1.0.0",
    description:
      "Execute code and commands in an isolated Linux sandbox environment.",
    authorization: null,
    icon: "CommandLineIcon",
    documentationUrl: null,
    // Predates the introduction of the rule, would require extensive work to
    // improve, already widely adopted.

    instructions:
      // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
      "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands. " +
      "Use `execute` to run commands and scripts. " +
      "The sandbox persists for the conversation duration. " +
      "Common tools like Python, Node.js, and standard Unix utilities are pre-installed. " +
      "IMPORTANT: Do NOT use shell backgrounding operators (& or nohup). " +
      "To run long-running processes (e.g. servers), use the `background` parameter of the `execute` tool. " +
      "When starting a background process, redirect its output to a log file (e.g. `python server.py > /tmp/server.log 2>&1`) so you can read the logs later with `cat`.",
  },
  // Note: The `as JSONSchema` cast is standard pattern across all metadata files.
  // zodToJsonSchema returns a compatible type but TypeScript can't verify it statically.
  tools: Object.values(SANDBOX_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SANDBOX_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
