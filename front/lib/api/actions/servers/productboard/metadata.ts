import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PRODUCTBOARD_TOOL_NAME = "productboard" as const;

export const PRODUCTBOARD_TOOLS_METADATA = createToolsRecord({
  create_note: {
    description:
      "Create a note in Productboard to capture customer feedback, insights, or support conversations.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Creating note in Productboard",
      done: "Create Productboard note",
    },
  },
  update_note: {
    description:
      "Update an existing note in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Updating note in Productboard",
      done: "Update Productboard note",
    },
  },
  get_note: {
    description:
      "Retrieve details of a specific note by ID. Use field selection to optimize response size and avoid large returns. By default, returns all non-null fields.",
    schema: {
      note_id: z.string().describe("UUID of the note to retrieve"),
      fields: z
        .array(z.string())
        .optional()
        .describe("OList of specific fields to retrieve"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting note from Productboard",
      done: "Get Productboard note",
    },
  },
  query_notes: {
    description:
      "Search for notes in your Productboard workspace. Notes are sorted by creation date, newest first.",
    schema: {
      page_cursor: z.string().optional().describe("Cursor for pagination"),
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
          "Field selection: 'all' for all fields including null, or comma-separated field names (e.g., 'name,tags,content')"
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
      page_cursor: z.string().optional().describe("Pagination cursor"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Querying entities in Productboard",
      done: "Query Productboard entities",
    },
  },
  create_entity: {
    description:
      "Create an entity in Productboard (products, components, features, initiatives, etc.)",
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
        .describe("Fields matching the entity object configuration."),
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
          "Relationships to create with the entity. Used for linking to parent entities, children, or other relationships."
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
      "Update an existing entity in Productboard. Use the fields object for simple updates or the patch array for granular operations.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Updating entity in Productboard",
      done: "Update Productboard entity",
    },
  },
  get_relationships: {
    description:
      "Get relationships for an entity (parent, children, linked notes, etc.).\n\nUse to understand how entities are connected in the product hierarchy.",
    schema: {
      entity_id: z.string().uuid().describe("UUID of the entity"),
      relationship_type: z
        .string()
        .optional()
        .describe(
          "Filter by relationship type (e.g., 'parent', 'child', 'link')"
        ),
      page_cursor: z.string().optional().describe("Pagination cursor"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting relationships from Productboard",
      done: "Get Productboard relationships",
    },
  },
  get_configuration: {
    description:
      "Get configuration for a specific entity type in this workspace. This is REQUIRED before creating or updating any entity or note. Returns available fields, required vs optional fields, field types, constraints, and allowed operations.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting configuration from Productboard",
      done: "Get Productboard configuration",
    },
  },
});

export const PRODUCTBOARD_SERVER_INSTRUCTIONS = `
**ALWAYS call \`get_configuration\` BEFORE creating or updating any entity or note.** Productboard has a flexible, workspace-specific data model where available fields, types, requirements, and allowed operations vary by workspace.

Productboard uses a configuration-driven API. Always start by calling get_configuration to understand available fields.

### Entity Types Reference

**Notes:** Use \`entity_type='simple'\` or \`entity_type='conversation'\`
**Entities:** Use \`entity_type='product'\`, \`'component'\`, \`'feature'\`, \`'subfeature'\`, \`'initiative'\`, \`'objective'\`, \`'keyResult'\`, \`'release'\`, \`'releaseGroup'\`, \`'company'\`, or \`'user'\`

### Required Workflow for Creating

1. Call \`get_configuration\` with the appropriate \`entity_type\`
2. Review the configuration response to identify:
   - Required fields (marked with \`required: true\`)
   - Optional fields you want to include
   - Field types and formats (see Field Value Types section)
   - Allowed operations for each field
3. Build the \`fields\` object using exact field names and types from the configuration
4. Optionally build the \`relationships\` array to link to other entities/customers
5. Call \`create_note\` or \`create_entity\` with the properly formatted data

### Required Workflow for Updating

1. Call \`get_configuration\` with the appropriate \`entity_type\`
2. Review the configuration response to identify:
   - Which fields can be updated (check \`lifecycle.update\` and \`lifecycle.patch\` properties)
   - Allowed operations for each field (set, clear, addItems, removeItems)
   - Field types and formats for values
3. Choose your update method:
   - **Field updates:** Use \`fields\` object to replace entire field values
   - **Patch operations:** Use \`patch\` array for granular updates with operations: \`set\` (replace value), \`clear\` (erase value), \`addItems\` (add to list), \`removeItems\` (remove from list)
   - **Operation rules:** Cannot combine set/clear with addItems/removeItems on same field; cannot combine set and clear on same field; can combine addItems and removeItems together
4. Build your update payload using exact field names and types from the configuration
5. Call \`update_note\` or \`update_entity\` with the properly formatted data

**Note:** The specific fields that support patch operations vary by workspace. Always check the configuration response for available operations.

---

## Pagination

The API uses cursor-based pagination for list endpoints. To fetch multiple pages:

1. Call the tool (e.g., \`query_notes\`) without \`page_cursor\` for the first page
2. If the response shows "More results available" with a \`pageCursor\`, call the tool again with \`page_cursor\` set to that value
3. Repeat until no \`pageCursor\` is returned

**Important:** Treat the \`pageCursor\` as an opaque string - do not parse or modify it.

---

The Productboard REST API v2 uses types to represent structured data in a more organized way. Understanding these types is essential for effectively working with the API since they are frequently used in the configuration endpoints.

## Field Value Types

Types are referenced from the configuration endpoints. After calling these endpoints, a response will include a \`data\` object that contains many \`fields\`. Each of these \`fields\` will contain a \`schema\` key and value (e.g., \`RichTextFieldValue\`, \`TextFieldValue\`, \`StatusFieldValue\`).

For detailed information about field value types, see: https://developer.productboard.com/v2.0.0/reference/field-value-types

### Basic Types

The following map to strings:
- \`UUIDFieldValue\`
- \`TextFieldValue\`
- \`RichTextFieldValue\` - HTML content (e.g., \`"<p>This is <b>rich</b> text.</p>"\`)
- \`DateFieldValue\` - ISO 8601 format without time (e.g., "2023-10-01")
- \`DateTimeFieldValue\` - ISO 8601 format (e.g., "2023-10-01T12:00:00Z")
- \`URLFieldValue\`
- \`NameFieldValue\`

The following map to numbers:
- \`NumberFieldValue\` - integers or floats, including negative numbers

The following map to booleans:
- \`BooleanFieldValue\`

The following map to enumerations:
- \`GranularityFieldValue\` - year, quarter, month, day

### Complex Types

**Status Fields:**
- \`StatusFieldValue\` - has \`id\` (UUID) and \`name\` (NameFieldValue)
- \`StatusFieldAssign\` - can be \`StatusFieldAssignById\` (with \`id\`) or \`StatusFieldAssignByName\` (with \`name\`)

**Member Fields:**
- \`MemberFieldValue\` - has \`id\` (UUID) and \`email\` (NameFieldValue)
- \`MemberFieldAssign\` - can be \`MemberAssignById\` (with \`id\`) or \`MemberAssignByEmail\` (with \`email\`)

**Teams Fields:**
- \`TeamFieldValue\` - has \`id\` (UUID) and \`name\` (NameFieldValue)
- \`TeamsFieldValue\` - array of \`TeamFieldValue\` objects
- \`TeamFieldAssign\` - can be \`TeamAssignById\` (with \`id\`) or \`TeamAssignByName\` (with \`name\`)
- \`TeamsFieldAssign\` - array of \`TeamFieldAssign\` objects

**Choice Fields:**
- \`SingleSelectFieldValue\` - has \`id\`, \`name\`, and \`color\`
- \`SingleSelectFieldAssign\` - can be \`SingleSelectFieldAssignById\` (with \`id\`) or \`SingleSelectFieldAssignByName\` (with \`name\`)
- \`MultiSelectFieldValue\` - array of \`SingleSelectFieldValue\` objects
- \`MultiSelectFieldAssign\` - array of \`SingleSelectFieldAssign\` objects

**Time Fields:**
- \`TimeframeFieldValue\` - has \`startDate\` (DateFieldValue), \`endDate\` (DateFieldValue), and \`granularity\` (GranularityFieldValue)

**Health Fields:**
- \`HealthFieldValue\` - has \`id\`, \`mode\` (manual/calculated), \`status\` (notSet/onTrack/atRisk/offTrack), \`previousStatus\`, \`lastUpdatedAt\`, \`comment\`, \`createdBy\`
- \`HealthUpdateFieldValue\` - has \`mode\`, \`status\`, \`comment\`, \`createdBy\`

**Progress Fields:**
- \`ProgressFieldValue\` - has \`startValue\`, \`targetValue\`, \`currentValue\` (all floats)
- \`WorkProgressFieldValue\` - has \`value\` (integer 0-100) and \`mode\` (manual/statusBased/calculated)

### FieldValue vs FieldAssign

- **FieldValue** types are used when retrieving data from the API (representing current field values)
- **FieldAssign** types are used when sending data to the API (representing how to set/update field values)

When a field has a \`FieldAssign\` type, you can often specify the value by \`id\` or by \`name\`. We recommend using IDs when possible, as names can change over time.

### ConversationNotePart

For conversation-type notes, the \`content\` field uses an array of \`ConversationNotePart\` objects:

\`\`\`typescript
interface ConversationNotePart {
  externalId: string;        // REQUIRED - External identifier for this message
  authorType: string;        // REQUIRED - Type of author (e.g., "customer", "agent")
  content: string;           // REQUIRED - HTML content of the message
  timestamp: string;         // REQUIRED - ISO 8601 timestamp (e.g., "2026-01-12T10:00:00Z")
  authorName?: string;       // OPTIONAL - Name of the message author
  id?: string;               // OPTIONAL - Internal Productboard ID (read-only, assigned by API)
}
\`\`\`


**Update Examples:**
- Field update: \`{fields: {name: "New name", tags: [{name: "tag1"}]}}\`
- Patch set: \`{patch: [{op: "set", path: "name", value: "New name"}]}\`
- Patch addItems: \`{patch: [{op: "addItems", path: "tags", value: [{name: "new-tag"}]}]}\`
- Patch clear: \`{patch: [{op: "clear", path: "owner"}]}\`
`;

export const PRODUCTBOARD_SERVER = {
  serverInfo: {
    name: "productboard",
    version: "1.0.0",
    description: "Manage productboard entities and notes.",
    authorization: {
      provider: "productboard",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "ProductboardLogo",
    documentationUrl: "https://docs.dust.tt/docs/productboard",
    // Predates the introduction of the rule, would require extensive work to
    // improve, as it's already widely adopted.
    // eslint-disable-next-line dust/no-mcp-server-instructions
    // biome-ignore lint/plugin/noMcpServerInstructions: existing usage
    instructions: PRODUCTBOARD_SERVER_INSTRUCTIONS,
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
