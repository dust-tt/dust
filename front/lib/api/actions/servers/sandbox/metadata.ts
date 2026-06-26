import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

// Default and maximum timeout the model can request for a single bash command.
// The value is enforced in-container by the `timeout` wrapper (see
// `wrapCommandWithCapture`), which kills the command and returns the captured
// output when it overruns.
export const SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS = 60000;
export const SANDBOX_MAX_COMMAND_TIMEOUT_MS = 120000;

// Outer MCP request deadline for the sandbox server. It must be strictly
// greater than the max in-container command timeout so the graceful
// in-container timeout (which returns partial output) always fires before the
// MCP layer hard-aborts the call. The buffer covers process teardown, output
// flushing, and the host round-trip.
const SANDBOX_MCP_TIMEOUT_BUFFER_MS = 30000;
export const SANDBOX_MCP_REQUEST_TIMEOUT_MS =
  SANDBOX_MAX_COMMAND_TIMEOUT_MS + SANDBOX_MCP_TIMEOUT_BUFFER_MS;

export const SANDBOX_TOOLS_METADATA = createToolsRecord({
  bash: {
    description:
      "Execute a shell command in an isolated sandbox environment. " +
      "The sandbox is a Linux container with common tools pre-installed. " +
      "Use this for running scripts, installing packages, or executing code. " +
      "The sandbox persists for the duration of the conversation.",
    schema: {
      description: z
        .string()
        .describe(
          "The reason this command is being run and what it achieves, in a few words. Use infinitive verbs (e.g. " +
            '"Set up environment", "Generate the chart").'
        ),
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
        .max(SANDBOX_MAX_COMMAND_TIMEOUT_MS)
        .optional()
        .describe(
          `Timeout in milliseconds for command execution. Defaults to ${SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS}, max ${SANDBOX_MAX_COMMAND_TIMEOUT_MS}.`
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Executing command",
      done: "Execute command in the Computer",
    },
    enableAlerting: true,
  },
  describe_toolset: {
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
      running: "Describing Computer toolset",
      done: "Describe Computer toolset",
    },
  },
  add_egress_domain: {
    description:
      "Request user approval to add a single domain to the current " +
      "sandbox's network allowlist. Each call adds one exact domain " +
      "(wildcards are not accepted) and requires an explicit user " +
      "approval. Only call this if the target domain is not already " +
      "covered by the workspace or sandbox allowlist. The workspace " +
      "allowlist is provided in the sandbox skill instructions; if the " +
      "domain or a wildcard parent is listed there, use the domain " +
      "directly. Outbound HTTPS connections that fall outside the " +
      "allowlist surface as denied entries in `<network_proxy_logs>` in " +
      "the bash tool output. Allowlist entries added through this tool " +
      "live for the lifetime of the current sandbox and are discarded " +
      "when the sandbox is reaped.",
    schema: {
      domain: z
        .string()
        .min(1)
        .describe(
          'Exact domain to allow for this sandbox, e.g. "api.openai.com". ' +
            "Wildcards are not supported."
        ),
      reason: z
        .string()
        .min(1)
        .describe(
          "Why this domain is needed, in one short sentence the user will " +
            "see in the approval prompt."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Requesting Computer network access",
      done: "Allow domain in the Computer",
      icon: "ActionGlobeAltIcon",
    },
  },
});

export const SANDBOX_SERVER = {
  serverInfo: {
    name: "sandbox",
    version: "1.0.0",
    description:
      "Execute code and commands in the conversation's Computer (an isolated Linux environment).",
    authorization: null,
    icon: "CommandLineIcon",
    documentationUrl: null,
    instructions: null,
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
