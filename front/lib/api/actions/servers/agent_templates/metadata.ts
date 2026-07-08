import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const AGENT_TEMPLATES_SERVER_NAME = "agent_templates" as const;

export const AGENT_TEMPLATES_TOOLS_METADATA = createToolsRecord({
  search_agent_templates: {
    description:
      "Search published agent templates. Use jobType for tag-based filtering or query for semantic search. Returns template details including instructions.",
    schema: {
      jobType: z
        .string()
        .optional()
        .describe(
          "User's job type to filter templates by relevant tags (e.g. 'sales', 'engineering', 'legal'). If omitted, returns all published templates."
        ),
      query: z
        .string()
        .optional()
        .describe(
          "Free-text query to semantically search templates. Use when the user describes a specific use case not covered by jobType tags."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching templates",
      done: "Search templates",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
  get_agent_template: {
    description:
      "Fetch the full details of an agent template by id, including its instructions and guidance.",
    schema: {
      templateId: z.string().describe("The sId of the template to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Fetching template",
      done: "Fetch template",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
});

export const AGENT_TEMPLATES_SERVER = {
  serverInfo: {
    name: AGENT_TEMPLATES_SERVER_NAME,
    version: "1.0.0",
    description: "Search and retrieve agent templates.",
    authorization: null,
    icon: "ActionDocumentTextIcon",
    documentationUrl: null,
  },
  tools: Object.values(AGENT_TEMPLATES_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
    toolCostCategory: t.toolCostCategory,
    freeUsage: t.freeUsage,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(AGENT_TEMPLATES_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
