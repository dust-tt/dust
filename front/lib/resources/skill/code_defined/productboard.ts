import type { GlobalSkillDefinition } from "@app/lib/resources/skill/code_defined/shared";

const PRODUCTBOARD_INSTRUCTIONS = `
You help users interact with Productboard: reading and managing features, initiatives, roadmaps, OKRs, customer feedback notes, companies, and product hierarchy entities.

Productboard uses a configuration-driven API. Available fields, types, and allowed operations vary per workspace. Always fetch the configuration before writing.

## Required workflow for creating an entity or note

1. Call get_configuration with the appropriate entity_type.
2. Review the response to identify required fields (marked required: true), field types, and allowed operations.
3. Build the fields object using exact field names and types from the configuration.
4. Optionally build relationships to link to parent entities or customers.
5. Call create_entity or create_note.

## Required workflow for updating an entity or note

1. Call get_configuration with the appropriate entity_type.
2. Identify which fields support update (lifecycle.update) and patch (lifecycle.patch).
3. Choose the update method:
   - fields object: replaces entire field values
   - patch array: granular operations — set (replace value), clear (erase value), addItems (add to list), removeItems (remove from list)
   - Cannot combine set/clear with addItems/removeItems on the same field; cannot combine set and clear on the same field; addItems and removeItems can be combined.
4. Call update_entity or update_note.

## Entity type reference

Notes: textNote, conversationNote
Entities: product, component, feature, subfeature, initiative, objective, keyResult, release, releaseGroup, company, user

## Field value types

Types appear in get_configuration responses under each field's schema key.

Scalars:
- TextFieldValue, NameFieldValue, URLFieldValue: string
- RichTextFieldValue: HTML string, e.g. "<p>This is <b>rich</b> text.</p>"
- UUIDFieldValue: string (UUID)
- DateFieldValue: ISO 8601 date, e.g. "2023-10-01"
- DateTimeFieldValue: ISO 8601 datetime, e.g. "2023-10-01T12:00:00Z"
- NumberFieldValue: number (integer or float, including negative)
- BooleanFieldValue: boolean
- GranularityFieldValue: "year" | "quarter" | "month" | "day"

Complex:
- StatusFieldValue: { id: UUID, name } — assign with StatusFieldAssignById ({ id }) or StatusFieldAssignByName ({ name })
- MemberFieldValue: { id: UUID, email } — assign with MemberAssignById or MemberAssignByEmail
- TeamFieldValue / TeamsFieldValue: { id, name } or array — assign with TeamAssignById or TeamAssignByName
- SingleSelectFieldValue: { id, name, color } — assign with SingleSelectFieldAssignById or SingleSelectFieldAssignByName
- MultiSelectFieldValue: array of SingleSelectFieldValue — assign with array of SingleSelectFieldAssign
- TimeframeFieldValue: { startDate, endDate, granularity }
- HealthFieldValue: { id, mode, status, previousStatus, lastUpdatedAt, comment, createdBy } — update via HealthUpdateFieldValue
- ProgressFieldValue: { startValue, targetValue, currentValue } (floats)
- WorkProgressFieldValue: { value: 0-100, mode: "manual" | "statusBased" | "calculated" }

FieldValue types are returned by the API. FieldAssign types are sent to the API. Prefer IDs over names when assigning — names can change, IDs are stable.

## ConversationNotePart (for conversationNote content field)

Each part requires: externalId (external identifier), authorType (e.g. "customer" or "agent"), content (HTML), timestamp (ISO 8601). Optional: authorName, id (read-only, assigned by API).

## Pagination

All list tools use cursor-based pagination. Omit page_cursor for the first page; pass the returned pageCursor value in the next call. Treat it as an opaque string.

## Update examples

Field update: { fields: { name: "New name", tags: [{ name: "tag1" }] } }
Patch set: { patch: [{ op: "set", path: "name", value: "New name" }] }
Patch addItems: { patch: [{ op: "addItems", path: "tags", value: [{ name: "new-tag" }] }] }
Patch clear: { patch: [{ op: "clear", path: "owner" }] }
`.trim();

export const productboardSkill = {
  sId: "productboard",
  name: "Productboard",
  userFacingDescription:
    "Read and manage Productboard features, initiatives, roadmaps, and customer feedback notes.",
  agentFacingDescription:
    "Enable when the user wants to query or update Productboard entities (features, initiatives, roadmaps, OKRs, notes) or manage customer feedback.",
  instructions: PRODUCTBOARD_INSTRUCTIONS,
  version: 1,
  mcpServers: [{ name: "productboard" }],
  icon: "ProductboardLogo",
} as const satisfies GlobalSkillDefinition;
