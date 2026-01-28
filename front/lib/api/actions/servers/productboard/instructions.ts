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
