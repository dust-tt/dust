import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

export const SANDBOX_TOOLS_METADATA = createToolsRecord({
  bash: {
    description:
      "Execute a shell command in an isolated sandbox environment. " +
      "The sandbox is a Linux container with common tools pre-installed. " +
      "Use this for running scripts, installing packages, or executing code. " +
      "The sandbox persists for the duration of the conversation.",
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
          "Timeout in milliseconds for command execution. Defaults to 60000, max 120000."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Executing command in sandbox",
      done: "Execute command in sandbox",
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
      "Use `bash` to run commands and scripts. " +
      "The sandbox persists for the conversation duration. " +
      "Common tools like Python, Node.js, and standard Unix utilities are pre-installed.",
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
