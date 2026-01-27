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
        .optional()
        .describe(
          "Timeout in milliseconds for command execution. Defaults to 60000 (60 seconds)."
        ),
    },
    stake: "low",
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
  },
  read_file: {
    description:
      "Read the contents of a file from the sandbox. " +
      "Returns the file content along with a snippet preview. " +
      "For large files, use this to retrieve results of computations or generated content.",
    schema: {
      path: z.string().describe("Absolute path to the file to read."),
    },
    stake: "never_ask",
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
  },
  push_file_to_dust: {
    description:
      "Push a file from the sandbox to Dust, making it available in the conversation. " +
      "Use this to return generated files (CSVs, images, documents) to the user.",
    schema: {
      path: z.string().describe("Absolute path to the file in the sandbox."),
      title: z
        .string()
        .optional()
        .describe("Title for the file in Dust. Defaults to the filename."),
    },
    stake: "low",
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
      "Use `execute` to run commands, `write_file`/`read_file` for file operations, " +
      "and `push_file_to_dust` to return generated files. " +
      "The sandbox persists for the conversation duration. " +
      "Common tools like Python, Node.js, and standard Unix utilities are pre-installed.",
  },
  tools: Object.values(SANDBOX_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(SANDBOX_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
