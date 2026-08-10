import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_LIST_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
import { getResourcePrefix } from "@app/lib/resources/string_ids";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import { z } from "zod";

export const RUN_AGENT_SERVER_NAME = "run_agent" as const;

// This is a placeholder tool name used in the metadata for UI detection.
// The actual tool name is dynamic: `run_<agent_name>`.
export const RUN_AGENT_PLACEHOLDER_TOOL_NAME = RUN_AGENT_SERVER_NAME;
export const GENERIC_RUN_AGENT_TOOL_NAME = RUN_AGENT_SERVER_NAME;

type RunAgentToolDescriptionArgs =
  | {
      executionMode: "run-agent";
      childAgentName: string;
      childAgentDescription: string;
    }
  | {
      executionMode: "handoff";
      childAgentName: string;
      childAgentDescription: string;
      childAgentMention: string;
    };

export function getRunAgentToolDescription(
  args: RunAgentToolDescriptionArgs
): string {
  switch (args.executionMode) {
    case "run-agent":
      return (
        `Delegate to ${args.childAgentName} (${args.childAgentDescription}) as a child agent/sub-agent in the background. ` +
        "Use this configured child agent when the request should run in its own conversation, then use its results in the main conversation."
      );

    case "handoff":
      return (
        `Handoff completely to ${args.childAgentName} (${args.childAgentDescription}). ` +
        `Inform the user that you are handing off to ${args.childAgentMention} before calling the tool since this child agent will respond directly in the conversation.`
      );

    default:
      return assertNever(args);
  }
}

export const RUN_AGENT_CONFIGURABLE_PROPERTIES = {
  executionMode: z
    .object({
      options: z
        .union([
          z
            .object({
              value: z.literal("run-agent"),
              label: z.literal("Agent runs in the background"),
            })
            .describe(
              "The selected agent runs in a background conversation and passes results back to " +
                "the main agent.\nThis is the default behavior, well suited for breaking down " +
                "complex work by delegating specific research/analysis subtasks while " +
                "maintaining control of the overall response."
            ),
          z
            .object({
              value: z.literal("handoff"),
              label: z.literal("Agent responds in conversation"),
            })
            .describe(
              "The selected agent takes over and responds directly in the conversation." +
                "\nWell suited for a routing use case where the sub-agent should handle " +
                "the entire interaction going forward."
            ),
        ])
        .optional(),
      value: z.union([z.literal("run-agent"), z.literal("handoff")]),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
    })
    .default({
      value: "run-agent",
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
    }),
  childAgent:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
};

const { childAgent: _childAgent, ...RUN_AGENT_RUNTIME_PROPERTIES } =
  RUN_AGENT_CONFIGURABLE_PROPERTIES;

export const RUN_AGENT_TOOL_SCHEMA = {
  description: z
    .string()
    .describe(
      "A short phrase explaining why you are delegating to this child agent/sub-agent and what it should achieve. Use infinitive verbs (e.g. " +
        '"Review Q1 performance", "Assess support backlog").'
    ),
  query: z
    .string()
    .describe(
      "The question or instruction to send to the child agent/sub-agent. The agent will process it using its own capabilities and knowledge."
    ),
  toolsetsToAdd: z
    .array(
      z
        .string()
        .regex(new RegExp(`^${getResourcePrefix("mcp_server_view")}_\\w+$`))
    )
    .describe(
      "The toolset IDs to give to the child agent in addition to the ones already set in the agent configuration."
    )
    .optional()
    .nullable(),
  fileOrContentFragmentIds: z
    .array(z.string().regex(new RegExp(`^[_\\w]+$`)))
    .describe(
      "File or content-fragment IDs (e.g. `file_xyz`, `cf_abc`) to forward as content " +
        "fragments to the sub-conversation. Use when you already have an ID returned by a " +
        "previous tool (uploaded file, content node). Prefer `filePaths` when you have a " +
        "scoped path."
    )
    .optional()
    .nullable(),
  filePaths: z
    .array(z.string())
    .describe(
      `Scoped file paths (e.g. \`conversation-<id>/foo.md\`, \`pod-<id>/spec.md\`) to forward ` +
        `to the sub-agent. Use paths as returned by \`${getPrefixedToolName(FILES_SERVER_NAME, FILES_LIST_ACTION_NAME)}\`. ` +
        "`conversation-<id>/...` paths are copied into the sub-conversation; " +
        "`pod-<id>/...` paths are passed through (the Pod file system is shared across " +
        "the Pod's conversations). " +
        "For binary sources (PDFs, images, audio), also include their `*.processed.<ext>` " +
        "sibling so the sub-agent can read the model-friendly representation."
    )
    .optional()
    .nullable(),
};

export const GENERIC_RUN_AGENT_TOOL_SCHEMA = {
  ...RUN_AGENT_TOOL_SCHEMA,
  ...RUN_AGENT_RUNTIME_PROPERTIES,
  agentId: z
    .string()
    .describe(
      "The sId of the agent to run. Use agent_router.list_all_published_agents to find an accessible agent."
    ),
};

export const GENERIC_RUN_AGENT_TOOLS_METADATA = [
  {
    name: GENERIC_RUN_AGENT_TOOL_NAME,
    description:
      "Run an accessible workspace agent by ID. Use agent_router.list_all_published_agents first to discover agent IDs.",
    schema: GENERIC_RUN_AGENT_TOOL_SCHEMA,
    stake: "never_ask",
    displayLabels: { running: "Running agent", done: "Run agent" },
    enableAlerting: true,
    toolCostCategory: "basic",
    freeUsage: false,
  },
] as const;

export const RUN_AGENT_SERVER = {
  serverInfo: {
    name: RUN_AGENT_SERVER_NAME,
    version: "1.0.0",
    description: "Run a child agent (agent as tool).",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
  },
  tools: [
    {
      name: RUN_AGENT_PLACEHOLDER_TOOL_NAME,
      description: "Run a child agent (agent as tool).",
      schema: {
        ...RUN_AGENT_TOOL_SCHEMA,
        ...RUN_AGENT_CONFIGURABLE_PROPERTIES,
      },
      displayLabels: {
        running: "Running agent",
        done: "Run agent",
      },
      toolCostCategory: "basic",
      freeUsage: false,
      stake: "never_ask",
    },
  ],
} as const satisfies ServerMetadata;
