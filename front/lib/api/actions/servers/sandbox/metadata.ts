import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

// Default and maximum timeout the model can request for a single bash command.
// The value is enforced in-container by the `timeout` wrapper (see
// `wrapCommandWithCapture`), which kills the command and returns the captured
// output when it overruns.
export const SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS = 60000;
const SANDBOX_MAX_COMMAND_TIMEOUT_MS = 180000;

// Extra time we add on top of a command's in-container timeout to set the
// timeout we give the sandbox provider. The in-container `timeout`
// wrapper stops the command and returns whatever output it has; this extra
// time lets that finish and reach us before the provider gives up. A few
// seconds is plenty (it only covers stopping the command and sending its
// output back). It must stay small enough that the provider timeout
// (max command timeout + this) stays under SANDBOX_MCP_REQUEST_TIMEOUT_MS.
export const SANDBOX_EXEC_TIMEOUT_BUFFER_MS = 10000;

// Outer MCP request deadline for the sandbox server. It must be strictly
// greater than the max in-container command timeout so the graceful
// in-container timeout (which returns partial output) always fires before the
// MCP layer hard-aborts the call. The buffer covers process teardown, output
// flushing, and the host round-trip.
const SANDBOX_MCP_TIMEOUT_BUFFER_MS = 30000;
export const SANDBOX_MCP_REQUEST_TIMEOUT_MS =
  SANDBOX_MAX_COMMAND_TIMEOUT_MS + SANDBOX_MCP_TIMEOUT_BUFFER_MS;

export const SANDBOX_TOOLS_METADATA = [
  {
    name: "bash",
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
    eager: true,
    displayLabels: {
      running: "Executing command",
      done: "Execute command in the Computer",
    },
    toolCostCategory: "basic",
    freeUsage: true,
    enableAlerting: true,
  },
  {
    name: "describe_toolset",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
  {
    name: "add_egress_domain",
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
      "persist for the lifetime of the conversation (across sandbox " +
      "restarts) and are scoped to this conversation only — including " +
      "inside a Pod, where Pod-wide domains are managed by admins in the " +
      "Pod's network settings.",
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
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const;

export const SANDBOX_SERVER = {
  serverInfo: {
    name: "sandbox",
    version: "1.0.0",
    description:
      "Execute code and commands in the conversation's Computer (an isolated Linux environment).",
    authorization: null,
    icon: "CommandLineIcon",
    documentationUrl: null,
  },
  tools: SANDBOX_TOOLS_METADATA,
} as const satisfies ServerMetadata;
