import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export function makeTextLines(lines: string[]) {
  return {
    type: "text" as const,
    text: lines.join("\n"),
  };
}

// Renders `key: value` pairs on one line, dropping the empty ones so absent fields cost nothing.
export function renderFields(
  fields: Record<string, string | number | boolean | null | undefined>
): string {
  return Object.entries(fields)
    .filter(
      ([, value]) => value !== null && value !== undefined && value !== ""
    )
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

// Trailer both list tools share: how many rows matched, and how to get the next page.
export function renderPageFooter({
  shown,
  total,
  nextCursor,
}: {
  shown: number;
  total: number;
  nextCursor: number | null;
}): string {
  const footer = `Showing ${shown} of ${total}.`;

  return nextCursor === null
    ? footer
    : `${footer} Pass cursor: ${nextCursor} for the next page.`;
}

// Slices `rows` for the requested page. Both list tools fetch the whole set and paginate in
// memory, like the skill_authoring server does: workspaces hold hundreds of agents and skills,
// not millions, and it keeps `total` exact.
export function paginate<T>(
  rows: T[],
  { cursor, limit }: { cursor?: number; limit?: number }
): Result<{ page: T[]; total: number; nextCursor: number | null }, MCPError> {
  const pageSize = Math.min(limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const offset = cursor ?? 0;

  if (offset >= rows.length && offset > 0) {
    return new Err(
      new MCPError(`cursor ${offset} is out of range (total: ${rows.length})`, {
        tracked: false,
      })
    );
  }

  const nextOffset = offset + pageSize;

  return new Ok({
    page: rows.slice(offset, nextOffset),
    total: rows.length,
    nextCursor: nextOffset < rows.length ? nextOffset : null,
  });
}
