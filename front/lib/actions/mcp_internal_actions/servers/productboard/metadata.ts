import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import { PRODUCTBOARD_SERVER_INSTRUCTIONS } from "@app/lib/actions/mcp_internal_actions/servers/productboard/instructions";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const PRODUCTBOARD_TOOL_NAME = "productboard" as const;

export const createNoteSchema = {
  type: z
    .enum(["simple", "conversation"])
    .describe(
      "Note type: 'simple' for plain feedback, 'conversation' for chat/email threads"
    ),
  fields: z
    .object({})
    .passthrough()
    .describe("Fields matching the note object configuration."),
  relationships: z
    .array(
      z.object({
        type: z.enum(["customer", "link"]),
        target: z.object({
          id: z.string().uuid(),
          type: z.enum(["user", "company", "link"]),
        }),
      })
    )
    .optional()
    .describe(
      "Optional relationships to create with the note. Used for atomically linking notes to customers (users or companies) and product links (like features)."
    ),
};

export const updateNoteSchema = {
  note_id: z.string().uuid().describe("UUID of the note to update"),
  fields: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      "Fields object for simple updates. Replaces entire field values."
    ),
  patch: z
    .array(
      z.union([
        z.object({
          op: z.enum(["set", "addItems", "removeItems"]),
          path: z.string(),
          value: z.unknown(),
        }),
        z.object({
          op: z.literal("clear"),
          path: z.string(),
        }),
      ])
    )
    .optional()
    .describe("Patch operations array for granular updates"),
};

export const getNoteSchema = {
  note_id: z.string().describe("UUID of the note to retrieve"),
  fields: z
    .array(z.string())
    .optional()
    .describe("OList of specific fields to retrieve"),
};

export const queryNotesSchema = {
  page_cursor: z.string().optional().describe("Cursor for pagination"),
  archived: z.boolean().optional().describe("Filter notes by archived status"),
  processed: z
    .boolean()
    .optional()
    .describe("Filter notes by processed status"),
  owner_id: z.string().uuid().optional().describe("Filter notes by owner UUID"),
  owner_email: z
    .string()
    .email()
    .optional()
    .describe("Filter notes by owner email"),
  creator_id: z
    .string()
    .uuid()
    .optional()
    .describe("Filter notes by creator UUID"),
  creator_email: z
    .string()
    .email()
    .optional()
    .describe("Filter notes by creator email"),
  source_record_id: z
    .string()
    .optional()
    .describe("Filter notes by external source record ID"),
  created_from: z
    .string()
    .optional()
    .describe(
      "Filter notes created on or after this date/time (ISO-8601, inclusive)"
    ),
  created_to: z
    .string()
    .optional()
    .describe(
      "Filter notes created on or before this date/time (ISO-8601, inclusive)"
    ),
  updated_from: z
    .string()
    .optional()
    .describe(
      "Filter notes updated on or after this date/time (ISO-8601, inclusive)"
    ),
  updated_to: z
    .string()
    .optional()
    .describe(
      "Filter notes updated on or before this date/time (ISO-8601, inclusive)"
    ),
  fields: z
    .string()
    .optional()
    .describe(
      "Field selection: 'all' for all fields including null, or comma-separated field names (e.g., 'name,tags,content')"
    ),
};

export const queryEntitiesSchema = {
  type: z
    .enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ])
    .describe("Entity type to search"),
  name: z.string().max(255).optional().describe("Filter by entity name"),
  archived: z.boolean().optional().describe("Filter by archived status"),
  parent_id: z
    .string()
    .uuid()
    .optional()
    .describe("Filter by parent entity UUID"),
  ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Filter by specific entity UUIDs"),
  status_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Filter by status UUIDs"),
  status_names: z
    .array(z.string())
    .optional()
    .describe("Filter by status names"),
  owner_ids: z
    .array(z.string().uuid())
    .optional()
    .describe("Filter by owner UUIDs"),
  owner_emails: z
    .array(z.string().email())
    .optional()
    .describe("Filter by owner emails"),
  timeframe_start_date: z
    .string()
    .optional()
    .describe("Filter by timeframe start date (ISO date format YYYY-MM-DD)"),
  timeframe_end_date: z
    .string()
    .optional()
    .describe("Filter by timeframe end date (ISO date format YYYY-MM-DD)"),
  fields: z
    .enum(["all", "default"])
    .optional()
    .describe(
      "Field selection: 'all' includes null values, 'default' only non-null"
    ),
  page_cursor: z.string().optional().describe("Pagination cursor"),
};

export const createEntitySchema = {
  type: z
    .enum([
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ])
    .describe("Entity type to create"),
  fields: z
    .object({})
    .passthrough()
    .describe("Fields matching the entity object configuration."),
  relationships: z
    .array(
      z.object({
        type: z.enum(["parent", "child", "link", "isBlockedBy", "isBlocking"]),
        target: z.object({
          id: z.string().uuid(),
        }),
      })
    )
    .optional()
    .describe(
      "Relationships to create with the entity. Used for linking to parent entities, children, or other relationships."
    ),
};

export const updateEntitySchema = {
  entity_id: z.string().uuid().describe("UUID of the entity to update"),
  fields: z
    .object({})
    .passthrough()
    .optional()
    .describe(
      "Fields object for simple updates. Replaces entire field values."
    ),
  patch: z
    .array(
      z.union([
        z.object({
          op: z.enum(["set", "addItems", "removeItems"]),
          path: z.string(),
          value: z.unknown(),
        }),
        z.object({
          op: z.literal("clear"),
          path: z.string(),
        }),
      ])
    )
    .optional()
    .describe("Patch operations array for granular updates"),
};

export const getRelationshipsSchema = {
  entity_id: z.string().uuid().describe("UUID of the entity"),
  relationship_type: z
    .string()
    .optional()
    .describe("Filter by relationship type (e.g., 'parent', 'child', 'link')"),
  page_cursor: z.string().optional().describe("Pagination cursor"),
};

export const getConfigurationSchema = {
  entity_type: z
    .enum([
      "simple",
      "conversation",
      "product",
      "component",
      "feature",
      "subfeature",
      "initiative",
      "objective",
      "keyResult",
      "release",
      "releaseGroup",
      "company",
      "user",
    ])
    .describe(
      "Entity type to get configuration for. Note types: 'simple', 'conversation'. Entity types: 'product', 'component', 'feature', etc."
    ),
};

export const PRODUCTBOARD_TOOLS: MCPToolType[] = [
  {
    name: "create_note",
    description:
      "Create a note in Productboard to capture customer feedback, insights, or support conversations.",
    inputSchema: zodToJsonSchema(z.object(createNoteSchema)) as JSONSchema,
  },
  {
    name: "update_note",
    description:
      "Update an existing note in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    inputSchema: zodToJsonSchema(z.object(updateNoteSchema)) as JSONSchema,
  },
  {
    name: "get_note",
    description:
      "Retrieve details of a specific note by ID. Use field selection to optimize response size and avoid large returns. By default, returns all non-null fields.",
    inputSchema: zodToJsonSchema(z.object(getNoteSchema)) as JSONSchema,
  },
  {
    name: "query_notes",
    description:
      "Search for notes in your Productboard workspace. Notes are sorted by creation date, newest first.",
    inputSchema: zodToJsonSchema(z.object(queryNotesSchema)) as JSONSchema,
  },
  {
    name: "query_entities",
    description:
      "Search for entities in Productboard, including products, companies, features, users, etc.",
    inputSchema: zodToJsonSchema(z.object(queryEntitiesSchema)) as JSONSchema,
  },
  {
    name: "create_entity",
    description:
      "Create an entity in Productboard (products, components, features, initiatives, etc.)",
    inputSchema: zodToJsonSchema(z.object(createEntitySchema)) as JSONSchema,
  },
  {
    name: "update_entity",
    description:
      "Update an existing entity in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    inputSchema: zodToJsonSchema(z.object(updateEntitySchema)) as JSONSchema,
  },
  {
    name: "get_relationships",
    description:
      "Get relationships for an entity (parent, children, linked notes, etc.). Use to understand how entities are connected in the product hierarchy.",
    inputSchema: zodToJsonSchema(
      z.object(getRelationshipsSchema)
    ) as JSONSchema,
  },
  {
    name: "get_configuration",
    description:
      "Get configuration for a specific entity type in this workspace. This is REQUIRED before creating or updating any entity or note. Returns available fields, required vs optional fields, field types, constraints, and allowed operations.",
    inputSchema: zodToJsonSchema(
      z.object(getConfigurationSchema)
    ) as JSONSchema,
  },
];

export const PRODUCTBOARD_SERVER_INFO = {
  name: "productboard" as const,
  version: "1.0.0",
  description: "Manage productboard entities and notes.",
  authorization: {
    provider: "productboard" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "ProductboardLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/productboard",
  instructions: PRODUCTBOARD_SERVER_INSTRUCTIONS,
};

export const PRODUCTBOARD_TOOL_STAKES = {
  get_note: "never_ask",
  query_notes: "never_ask",
  create_note: "low",
  update_note: "low",
  query_entities: "never_ask",
  get_relationships: "never_ask",
  create_entity: "low",
  update_entity: "low",
  get_configuration: "never_ask",
} as const satisfies Record<string, MCPToolStakeLevelType>;
