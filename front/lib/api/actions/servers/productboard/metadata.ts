import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PRODUCTBOARD_TOOLS_METADATA = createToolsRecord({
  create_note: {
    description:
      "Create a note in Productboard to capture customer feedback, insights, " +
      "or support conversations. Call get_configuration for the note type " +
      "first, then build fields from the returned workspace configuration.",
    schema: {
      type: z
        .enum(["textNote", "conversationNote"])
        .describe(
          "Note type: 'textNote' for plain feedback, 'conversationNote' for chat/email threads"
        ),
      fields: z
        .object({})
        .passthrough()
        .describe(
          "Fields object using exact field names and FieldAssign shapes from " +
            "get_configuration for this note type. Rich text content must be " +
            "HTML; conversationNote content uses an array of conversation " +
            "message parts."
        ),
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
          "Optional relationships to create with the note. Used for " +
            "atomically linking notes to customers (users or companies) and " +
            "product links (like features)."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating note in Productboard",
      done: "Create Productboard note",
    },
  },
  update_note: {
    description:
      "Update an existing note in Productboard. Call get_configuration for " +
      "the note type first to confirm editable fields and allowed operations. " +
      "Use fields for simple updates or patch for granular operations.",
    schema: {
      note_id: z.string().uuid().describe("UUID of the note to update"),
      fields: z
        .object({})
        .passthrough()
        .optional()
        .describe(
          "Fields object for simple updates. Replaces entire field values " +
            "using exact field names and FieldAssign shapes from " +
            "get_configuration."
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
        .describe(
          "Patch operations for granular updates, limited to operations " +
            "allowed by get_configuration. Do not mix set or clear with " +
            "addItems or removeItems on the same field."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Updating note in Productboard",
      done: "Update Productboard note",
    },
  },
  get_note: {
    description:
      "Retrieve details of a specific note by ID. Use field selection to " +
      "optimize response size and avoid large returns. By default, returns " +
      "all non-null fields.",
    schema: {
      note_id: z.string().describe("UUID of the note to retrieve"),
      fields: z
        .array(z.string())
        .optional()
        .describe("List of specific fields to retrieve"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting note from Productboard",
      done: "Get Productboard note",
    },
  },
  query_notes: {
    description:
      "Search for notes in your Productboard workspace. Notes are sorted by " +
      "creation date, newest first.",
    schema: {
      page_cursor: z
        .string()
        .optional()
        .describe("Opaque cursor returned by a previous query_notes response"),
      archived: z
        .boolean()
        .optional()
        .describe("Filter notes by archived status"),
      processed: z
        .boolean()
        .optional()
        .describe("Filter notes by processed status"),
      owner_id: z
        .string()
        .uuid()
        .optional()
        .describe("Filter notes by owner UUID"),
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
          "Field selection: 'all' for all fields including null, or " +
            "comma-separated field names (e.g., 'name,tags,content')"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying notes in Productboard",
      done: "Query Productboard notes",
    },
  },
  query_entities: {
    description:
      "Search for entities in Productboard, including products, companies, features, users, etc.",
    schema: {
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
        .describe(
          "Filter by timeframe start date (ISO date format YYYY-MM-DD)"
        ),
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
      page_cursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor returned by a previous query_entities response"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying entities in Productboard",
      done: "Query Productboard entities",
    },
  },
  create_entity: {
    description:
      "Create an entity in Productboard (products, components, features, " +
      "initiatives, etc.). Call get_configuration for the entity type first, " +
      "then build fields from the returned workspace configuration.",
    schema: {
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
        .describe(
          "Fields object using exact field names and FieldAssign shapes from " +
            "get_configuration for this entity type. Prefer IDs over names " +
            "when the configuration allows both."
        ),
      relationships: z
        .array(
          z.object({
            type: z.enum([
              "parent",
              "child",
              "link",
              "isBlockedBy",
              "isBlocking",
            ]),
            target: z.object({
              id: z.string().uuid(),
            }),
          })
        )
        .optional()
        .describe(
          "Relationships to create with the entity. Use relationship names " +
            "and target IDs allowed by get_configuration."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating entity in Productboard",
      done: "Create Productboard entity",
    },
  },
  update_entity: {
    description:
      "Update an existing entity in Productboard. Call get_configuration for " +
      "the entity type first to confirm editable fields and allowed " +
      "operations. Use fields for simple updates or patch for granular " +
      "operations.",
    schema: {
      entity_id: z.string().uuid().describe("UUID of the entity to update"),
      fields: z
        .object({})
        .passthrough()
        .optional()
        .describe(
          "Fields object for simple updates. Replaces entire field values " +
            "using exact field names and FieldAssign shapes from " +
            "get_configuration."
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
        .describe(
          "Patch operations for granular updates, limited to operations " +
            "allowed by get_configuration. Do not mix set or clear with " +
            "addItems or removeItems on the same field."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Updating entity in Productboard",
      done: "Update Productboard entity",
    },
  },
  get_relationships: {
    description:
      "Get relationships for an entity (parent, children, linked notes, " +
      "etc.).\n\nUse to understand how entities are connected in the product " +
      "hierarchy.",
    schema: {
      entity_id: z.string().uuid().describe("UUID of the entity"),
      relationship_type: z
        .string()
        .optional()
        .describe(
          "Filter by relationship type (e.g., 'parent', 'child', 'link')"
        ),
      page_cursor: z
        .string()
        .optional()
        .describe(
          "Opaque cursor returned by a previous get_relationships response"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting relationships from Productboard",
      done: "Get Productboard relationships",
    },
  },
  get_configuration: {
    description:
      "Get configuration for a specific entity type in this workspace. This " +
      "is REQUIRED before creating or updating any entity or note. Returns " +
      "available fields, required vs optional fields, field types, " +
      "constraints, and allowed operations.",
    schema: {
      entity_type: z
        .enum([
          "textNote",
          "conversationNote",
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
          "Entity type to get configuration for. Note types: 'textNote', " +
            "'conversationNote'. Entity types: 'product', 'component', " +
            "'feature', etc."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting configuration from Productboard",
      done: "Get Productboard configuration",
    },
  },
});

export const PRODUCTBOARD_SERVER = {
  serverInfo: {
    name: "productboard",
    version: "1.0.0",
    description:
      "Manage Productboard product management data: features, initiatives, " +
      "roadmaps, OKRs, customer feedback notes, companies, and product " +
      "hierarchy entities.",
    authorization: {
      provider: "productboard",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ProductboardLogo",
    documentationUrl: "https://docs.dust.tt/docs/productboard",
    instructions: null,
  },
  tools: Object.values(PRODUCTBOARD_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(PRODUCTBOARD_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
