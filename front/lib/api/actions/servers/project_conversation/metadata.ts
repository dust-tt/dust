// eslint-disable-next-line dust/enforce-client-types-in-public-api

import { ConfigurableToolInputSchemas } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROJECT_CONVERSATION_SERVER_NAME = "project_conversation" as const;

export const PROJECT_CONVERSATION_TOOLS_METADATA = createToolsRecord({
  create_conversation: {
    description:
      "Create a new conversation in the project and post a user message. The message will be sent on behalf of the user executing the tool.",
    schema: {
      message: z
        .string()
        .describe("The message content to post in the new conversation"),
      title: z.string().describe("Title for the conversation"),
      agentId: z
        .string()
        .optional()
        .describe("Optional agent ID to mention in the conversation"),
      dustProject:
        ConfigurableToolInputSchemas[
          INTERNAL_MIME_TYPES.TOOL_INPUT.DUST_PROJECT
        ].optional(),
    },
    stake: "low",
    displayLabels: {
      running: "Creating conversation",
      done: "Create conversation",
    },
  },
});

const PROJECT_CONVERSATION_INSTRUCTIONS =
  "Create new conversations within a project. " +
  "Requires write permissions on the project space.";

export const PROJECT_CONVERSATION_SERVER = {
  serverInfo: {
    name: "project_conversation",
    version: "1.0.0",
    description:
      "Create and manage conversations within projects. Post messages to new conversations on behalf of users.",
    icon: "ActionMegaphoneIcon",
    authorization: null,
    documentationUrl: null,
    // These instructions do not belong on the server, they should either be bundled on the
    // instructions since always added programmatically or bundled in a skill.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
    instructions: PROJECT_CONVERSATION_INSTRUCTIONS,
  },
  tools: Object.values(PROJECT_CONVERSATION_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PROJECT_CONVERSATION_TOOLS_METADATA).map((t) => [
      t.name,
      t.stake,
    ])
  ),
} as const satisfies ServerMetadata;
