import {
  SANDBOX_DEFAULT_COMMAND_TIMEOUT_MS,
  SANDBOX_MAX_COMMAND_TIMEOUT_MS,
} from "@app/lib/actions/constants";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const SANDBOX_TOOL_NAME = "sandbox" as const;

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
        .min(1000)
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
      "restarts). In a Pod, approvals are Pod-wide: the domain is allowed " +
      "for every conversation in the Pod and the Pod's shared sandbox, so " +
      "make that scope clear when asking the user.",
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
