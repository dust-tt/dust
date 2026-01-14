import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPToolType } from "@app/lib/api/mcp";
import { getResourcePrefix } from "@app/lib/resources/string_ids";

export const runAgentConfigurablePropertiesSchema = {
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
      value: z.string(),
      mimeType: z.literal(INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM),
    })
    .default({
      value: "run-agent",
      mimeType: INTERNAL_MIME_TYPES.TOOL_INPUT.ENUM,
    }),
  childAgent:
    ConfigurableToolInputSchemas[INTERNAL_MIME_TYPES.TOOL_INPUT.AGENT],
};

export const runAgentToolSchema = {
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
  ...runAgentConfigurablePropertiesSchema,
};

// Note: The actual tool name is dynamic (run_${childAgentName}), but this
// provides a representative definition for static metadata discovery.

export const RUN_AGENT_TOOLS: MCPToolType[] = [
  {
    name: "run_agent",
    description:
      "Run a child agent in the background and pass results back to the main agent. " +
      "You will have access to the results of the agent in the conversation.",
    inputSchema: zodToJsonSchema(z.object(runAgentToolSchema)) as JSONSchema,
  },
];

export const RUN_AGENT_SERVER_INFO = {
  name: "run_agent" as const,
  version: "1.0.0",
  description: "Run a child agent (agent as tool).",
  icon: "ActionRobotIcon" as const,
  authorization: null,
  documentationUrl: null,
  instructions: null,
};
