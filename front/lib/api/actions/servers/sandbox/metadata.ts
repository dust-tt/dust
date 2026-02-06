import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

export const SANDBOX_TOOLS_METADATA = createToolsRecord({
  execute: {
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
    stake: "low",
    displayLabels: {
      running: "Executing command in sandbox",
      done: "Execute command in sandbox",
    },
  },
  write_file: {
    description:
      "Write content to a file in the sandbox. " +
      "Creates parent directories if they don't exist. " +
      "Overwrites the file if it already exists.",
    schema: {
      path: z
        .string()
        .describe(
          "Absolute path where the file should be written in the sandbox."
        ),
      content: z.string().describe("The content to write to the file."),
    },
    stake: "low",
    displayLabels: {
      running: "Writing file to sandbox",
      done: "Write file to sandbox",
    },
  },
  read_file: {
    description:
      "Read a file from the sandbox and make it available as a Dust file. " +
      "Use this to retrieve results of computations, generated content, or any file " +
      "that should be shared with the user in the conversation.",
    schema: {
      path: z.string().describe("Absolute path to the file to read."),
      title: z
        .string()
        .optional()
        .describe("Title for the file in Dust. Defaults to the filename."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading file from sandbox",
      done: "Read file from sandbox",
    },
  },
  list_files: {
    description:
      "List files and directories in the sandbox. " +
      "Returns file names, sizes, and types (file/directory).",
    schema: {
      path: z
        .string()
        .optional()
        .describe("Directory path to list. Defaults to /tmp."),
      recursive: z
        .boolean()
        .optional()
        .describe("Whether to list files recursively. Defaults to false."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing files in sandbox",
      done: "List files in sandbox",
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
    instructions:
      "The sandbox provides an isolated Linux environment for running code, scripts, and shell commands. " +
      "Use `execute` to run commands, `write_file`/`read_file` for file operations. " +
      "Use `read_file` to retrieve generated files and make them available in the conversation. " +
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
