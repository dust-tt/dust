import { MCPError } from "@app/lib/actions/mcp_errors";
import type { GenericRecord } from "@app/lib/api/actions/servers/servicenow/client";
import {
  FIELD_NAME_REGEX,
  isSystemManagedFieldName,
} from "@app/lib/api/actions/servers/servicenow/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";

// Generic rendering for the list_records/get_record/create_record/update_record tools, which
// can return an arbitrary field set depending on the table and any requested field projection.
export function renderRecord(record: GenericRecord): string {
  const { sys_id, number, ...rest } = record;
  const lines = [`- **sys_id**: ${sys_id}`];
  if (isString(number)) {
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

// Fields writable through create_record/update_record must be valid ServiceNow field
// identifiers and must not be system-managed (sys_* / sys_id / number, which ServiceNow assigns
// itself — setting them would either be silently ignored or let a caller spoof identity fields).
// This produces the nicer aggregated error message for the tool-call path; client.ts's
// createRecord/updateRecord re-check the same `isSystemManagedFieldName` independently as a
// backstop for any caller that doesn't go through this validator.
export function validateWritableFields(
  fields: Record<string, string | number | boolean | null> | undefined
): Result<Record<string, string | number | boolean | null>, MCPError> {
  if (!fields) {
    return new Ok({});
  }

  const invalidNames: string[] = [];
  const systemManagedNames: string[] = [];

  for (const name of Object.keys(fields)) {
    if (!FIELD_NAME_REGEX.test(name)) {
      invalidNames.push(name);
      continue;
    }
    if (isSystemManagedFieldName(name)) {
      systemManagedNames.push(name);
    }
  }

  if (invalidNames.length > 0 || systemManagedNames.length > 0) {
    const issues: string[] = [];
    if (invalidNames.length > 0) {
      issues.push(`invalid field name(s): ${invalidNames.join(", ")}`);
    }
    if (systemManagedNames.length > 0) {
      issues.push(
        `system-managed field(s) cannot be set: ${systemManagedNames.join(", ")}`
      );
    }
    return new Err(
      new MCPError(`Invalid fields — ${issues.join("; ")}.`, {
        tracked: false,
      })
    );
  }

  return new Ok(fields);
}
