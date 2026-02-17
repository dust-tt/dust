// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getResourcePrefix } from "@app/lib/resources/string_ids";
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// This is a placeholder tool name used in the metadata for UI detection.
// The actual tool name is dynamic: `run_<agent_name>`.
export const RUN_AGENT_PLACEHOLDER_TOOL_NAME = "run_agent" as const;

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

export const RUN_AGENT_TOOL_SCHEMA = {
  query: z
    .string()
    .describe(
      "The query sent to the agent. This is the question or instruction that will be " +
        "processed by the agent, which will respond with its own capabilities and knowledge."
    ),
  toolsetsToAdd: z
    .array(
      z
        .string()
        .regex(new RegExp(`^${getResourcePrefix("mcp_server_view")}_\\w+$`))
    )
    .describe(
      "The toolsets ids to add to the agent in addition to the ones already set in the agent configuration."
    )
    .optional()
    .nullable(),
  fileOrContentFragmentIds: z
    .array(z.string().regex(new RegExp(`^[_\\w]+$`)))
    .describe(
      "The filesId of the files to pass to the agent conversation. If the file is a content node, use the contentFragmentId instead."
    )
    .optional()
    .nullable(),
};

export const RUN_AGENT_SERVER = {
  serverInfo: {
    name: "run_agent",
    version: "1.0.0",
    description: "Run a child agent (agent as tool).",
    authorization: null,
    icon: "ActionRobotIcon",
    documentationUrl: null,
    instructions: null,
  },
  // The actual tool name is dynamic, but we need a placeholder tool
  // with the configurable properties schema so that the UI can detect that this server
  // requires child agent configuration before being added.
  tools: [
    {
      name: RUN_AGENT_PLACEHOLDER_TOOL_NAME,
      description: "Run a child agent (agent as tool).",
      inputSchema: zodToJsonSchema(
        z.object({
          ...RUN_AGENT_TOOL_SCHEMA,
          ...RUN_AGENT_CONFIGURABLE_PROPERTIES,
        })
      ) as JSONSchema,
      displayLabels: {
        running: "Running agent",
        done: "Run agent",
      },
    },
  ],
  // Default stake for dynamically created run_agent tools.
  // The actual tool name is dynamic, but all run_agent tools have the same stake.
  tools_stakes: {
    [RUN_AGENT_PLACEHOLDER_TOOL_NAME]: "never_ask",
  },
} as const satisfies ServerMetadata;
