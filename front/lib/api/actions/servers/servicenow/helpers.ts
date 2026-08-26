import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  GenericRecord,
  Incident,
} from "@app/lib/api/actions/servers/servicenow/client";
import { FIELD_NAME_REGEX } from "@app/lib/api/actions/servers/servicenow/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function renderIncident(incident: Incident): string {
  let text = `- **${incident.number}**: ${incident.short_description || "(no description)"}`;
  text += `\n  - State: ${incident.state || "unknown"}`;
  text += `\n  - Priority: ${incident.priority || "unknown"}`;
  text += `\n  - Opened: ${incident.opened_at || "unknown"}`;
  return text;
}

// Generic rendering for the list_records/get_record tools, which can return an arbitrary field
// set depending on the table and any requested field projection.
export function renderRecord(record: GenericRecord): string {
  const { sys_id, number, ...rest } = record;
  const lines = [`- **sys_id**: ${sys_id}`];
  if (typeof number === "string") {
    lines.unshift(`- **number**: ${number}`);
  }
  for (const [key, value] of Object.entries(rest).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    lines.push(`  - ${key}: ${value ?? "unknown"}`);
  }
  return lines.join("\n");
}

export function renderPaginationFooter({
  hasMore,
  nextCursor,
  returnedCount,
  totalCount,
}: {
  hasMore: boolean;
  nextCursor: string | null;
  returnedCount: number;
  totalCount?: number;
}): string {
  const parts: string[] = [];
  if (totalCount !== undefined) {
    parts.push(`${totalCount} total`);
  }
  parts.push(`${returnedCount} returned`);
  parts.push(
    hasMore && nextCursor
      ? `more available — pass cursor \`${nextCursor}\` to continue`
      : "no more results"
  );
  return `\n\n*${parts.join(", ")}.*`;
}

// Fields writable through `additionalFields` on create_incident/update_incident must be: valid
// ServiceNow field identifiers, not system-managed (sys_* / sys_id / number, which ServiceNow
// assigns), and not a duplicate of one of the tool's own typed fields (which should be used
// instead so ServiceNow's display-value handling and our own typing stay in effect).
const SYSTEM_MANAGED_FIELD_NAMES = new Set(["sys_id", "number"]);

const TYPED_INCIDENT_FIELD_NAMES = new Set([
  "short_description",
  "description",
  "urgency",
  "impact",
  "priority",
  "state",
  "category",
  "assignment_group",
  "work_notes",
  "close_notes",
  "close_code",
]);

export function validateAdditionalFields(
  additionalFields: Record<string, string | number | boolean | null> | undefined
): Result<Record<string, string | number | boolean | null>, MCPError> {
  if (!additionalFields) {
    return new Ok({});
  }

  const invalidNames: string[] = [];
  const systemManagedNames: string[] = [];
  const collidingNames: string[] = [];

  for (const name of Object.keys(additionalFields)) {
    if (!FIELD_NAME_REGEX.test(name)) {
      invalidNames.push(name);
      continue;
    }
    if (name.startsWith("sys_") || SYSTEM_MANAGED_FIELD_NAMES.has(name)) {
      systemManagedNames.push(name);
      continue;
    }
    if (TYPED_INCIDENT_FIELD_NAMES.has(name)) {
      collidingNames.push(name);
    }
  }

  if (
    invalidNames.length > 0 ||
    systemManagedNames.length > 0 ||
    collidingNames.length > 0
  ) {
    const issues: string[] = [];
    if (invalidNames.length > 0) {
      issues.push(`invalid field name(s): ${invalidNames.join(", ")}`);
    }
    if (systemManagedNames.length > 0) {
      issues.push(
        `system-managed field(s) cannot be set: ${systemManagedNames.join(", ")}`
      );
    }
    if (collidingNames.length > 0) {
      issues.push(
        `use the dedicated parameter instead of additionalFields for: ${collidingNames.join(", ")}`
      );
    }
    return new Err(
      new MCPError(`Invalid additionalFields — ${issues.join("; ")}.`, {
        tracked: false,
      })
    );
  }

  return new Ok(additionalFields);
}
