import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

const agentId = z.string().min(1).describe("Cursor Cloud Agent ID.");
const runId = z.string().min(1).describe("Cursor Cloud Agent run ID.");
const paginationSchema = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe("Maximum number of results to return."),
  cursor: z
    .string()
    .optional()
    .describe("Pagination cursor from the previous response."),
};

export const CURSOR_CLOUD_AGENTS_SERVER_NAME = "cursor_cloud_agents" as const;

export const CURSOR_CLOUD_AGENTS_TOOLS_METADATA = [
  {
    name: "launch_agent",
    description:
      "Launch a Cursor Cloud Agent and enqueue its first coding run on one or more GitHub repositories.",
    schema: {
      prompt: z.string().min(1).describe("Task instructions for the agent."),
      name: z
        .string()
        .min(1)
        .max(100)
        .optional()
        .describe("Display name for the agent."),
      repositoryUrls: z
        .array(z.string().url())
        .max(20)
        .optional()
        .describe(
          "GitHub repository URLs for the agent. Omit to launch a repository-less agent."
        ),
      startingRef: z
        .string()
        .optional()
        .describe(
          "Branch or commit SHA to use for every repository. Ignored when pullRequestUrl is provided."
        ),
      pullRequestUrl: z
        .string()
        .url()
        .optional()
        .describe(
          "GitHub pull request to work on. Requires exactly one repositoryUrl."
        ),
      environmentType: z
        .enum(["cloud", "pool", "machine"])
        .optional()
        .describe("Cursor execution environment type."),
      environmentName: z
        .string()
        .optional()
        .describe("Named Cursor environment, pool, or machine."),
      modelId: z
        .string()
        .optional()
        .describe("Model ID returned by list_models."),
      modelParams: z
        .array(
          z.object({
            id: z.string().min(1),
            value: z.string().min(1),
          })
        )
        .optional()
        .describe("Optional parameters supported by the selected model."),
      mode: z
        .enum(["agent", "plan"])
        .optional()
        .describe("Start in implementation or planning mode."),
      imageUrls: z
        .array(z.string().url())
        .max(5)
        .optional()
        .describe("Public HTTP(S) image URLs to include with the prompt."),
      workOnCurrentBranch: z
        .boolean()
        .optional()
        .describe("Push directly to the supplied branch or PR head."),
      autoCreatePR: z
        .boolean()
        .optional()
        .describe("Open a pull request after the run completes."),
      skipReviewerRequest: z
        .boolean()
        .optional()
        .describe("Skip requesting the Cursor user as a PR reviewer."),
    },
    stake: "high",
    displayLabels: {
      running: "Launching Cursor Cloud Agent",
      done: "Launch Cursor Cloud Agent",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_agents",
    description:
      "List IDs, statuses, and latest runs for Cursor Cloud Agents available through the configured API key.",
    schema: {
      ...paginationSchema,
      includeArchived: z
        .boolean()
        .optional()
        .describe("Include archived agents. Cursor defaults this to true."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Cursor Cloud Agents",
      done: "List Cursor Cloud Agents",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_agent",
    description:
      "Get a Cursor Cloud Agent, including repositories, configuration, and latest run ID.",
    schema: { agentId },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Cursor Cloud Agent",
      done: "Get Cursor Cloud Agent",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "create_run",
    description:
      "Create a follow-up coding or planning run on an existing Cursor Cloud Agent.",
    schema: {
      agentId,
      prompt: z.string().min(1).describe("Follow-up instructions."),
      mode: z
        .enum(["agent", "plan"])
        .optional()
        .describe("Run in implementation or planning mode."),
      imageUrls: z
        .array(z.string().url())
        .max(5)
        .optional()
        .describe("Public HTTP(S) image URLs to include with the prompt."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Cursor agent run",
      done: "Create Cursor agent run",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_runs",
    description:
      "List coding and planning runs for a Cursor Cloud Agent, newest first.",
    schema: { agentId, ...paginationSchema },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Cursor agent runs",
      done: "List Cursor agent runs",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_run",
    description:
      "Get the status, final response, branches, and pull requests for a Cursor Cloud Agent run.",
    schema: { agentId, runId },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Cursor agent run",
      done: "Get Cursor agent run",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "cancel_run",
    description:
      "Cancel an active Cursor Cloud Agent run without deleting its agent.",
    schema: { agentId, runId },
    stake: "low",
    displayLabels: {
      running: "Cancelling Cursor agent run",
      done: "Cancel Cursor agent run",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_agent_usage",
    description:
      "Get token usage for a Cursor Cloud Agent, optionally limited to one run.",
    schema: {
      agentId,
      runId: runId.optional(),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Cursor agent usage",
      done: "Get Cursor agent usage",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_artifacts",
    description:
      "List screenshots, recordings, logs, and other artifacts produced by a Cursor Cloud Agent.",
    schema: { agentId },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Cursor agent artifacts",
      done: "List Cursor agent artifacts",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_artifact_download_url",
    description:
      "Get a temporary download URL for an artifact produced by a Cursor Cloud Agent.",
    schema: {
      agentId,
      path: z
        .string()
        .min(1)
        .describe("Artifact path returned by list_artifacts."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Cursor artifact link",
      done: "Get Cursor artifact link",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "archive_agent",
    description:
      "Archive a Cursor Cloud Agent so it is removed from the active view.",
    schema: { agentId },
    stake: "low",
    displayLabels: {
      running: "Archiving Cursor Cloud Agent",
      done: "Archive Cursor Cloud Agent",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "unarchive_agent",
    description:
      "Unarchive a Cursor Cloud Agent and return it to the active view.",
    schema: { agentId },
    stake: "low",
    displayLabels: {
      running: "Unarchiving Cursor Cloud Agent",
      done: "Unarchive Cursor Cloud Agent",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "delete_agent",
    description:
      "Delete a Cursor Cloud Agent and its associated data permanently.",
    schema: { agentId },
    stake: "high",
    displayLabels: {
      running: "Deleting Cursor Cloud Agent",
      done: "Delete Cursor Cloud Agent",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "get_api_key_info",
    description: "Get identifying metadata for the configured Cursor API key.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting Cursor API key info",
      done: "Get Cursor API key info",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_models",
    description:
      "List Cursor models and model parameters available for Cloud Agent runs.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Cursor models",
      done: "List Cursor models",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
  {
    name: "list_repositories",
    description:
      "List GitHub repositories available to Cursor Cloud Agents through the configured API key.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing Cursor repositories",
      done: "List Cursor repositories",
    },
    toolCostCategory: "advanced",
    freeUsage: false,
  },
] as const;

export const CURSOR_CLOUD_AGENTS_SERVER = {
  serverInfo: {
    name: CURSOR_CLOUD_AGENTS_SERVER_NAME,
    version: "1.0.0",
    description:
      "Launch, manage, and inspect Cursor Cloud Agents, coding runs, repositories, models, usage, and artifacts.",
    authorization: null,
    icon: "CursorLogo",
    documentationUrl: "https://cursor.com/docs/cloud-agent/api/endpoints",
  },
  tools: CURSOR_CLOUD_AGENTS_TOOLS_METADATA,
} as const satisfies ServerMetadata;
