import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Response } from "undici";
import { z } from "zod";

const DEFAULT_LIST_LIMIT = 25;
// ServiceNow instances commonly cap sysparm_limit around this range; clamping here keeps a
// single page request cheap regardless of what a caller asks for.
const MAX_PAGE_LIMIT = 1000;

// ServiceNow field names are lowercase snake_case identifiers (including custom `u_*` and
// scoped-app `x_<scope>_*` fields).
export const FIELD_NAME_REGEX = /^[a-z][a-z0-9_]*$/i;

// sys_id is a 32-character hex GUID, present and immutable on every table. It's the only
// identifier safe to interpolate into a Table API path across arbitrary tables.
const SYS_ID_REGEX = /^[0-9a-f]{32}$/i;

function isValidSysId(value: string): boolean {
  return SYS_ID_REGEX.test(value);
}

// The generic list_records/get_record tools accept any table name rather than a fixed
// allowlist: access is enforced by ServiceNow itself (the connected account's own ACLs/roles),
// not by Dust. `FIELD_NAME_REGEX` still gates what reaches the request, though — `table` is
// interpolated directly into the request path unencoded, so it must be validated as a plain
// identifier to rule out path/query injection (e.g. "incident/../sys_user").
function isValidTableName(table: string): boolean {
  return FIELD_NAME_REGEX.test(table);
}

export const IncidentSchema = z.object({
  sys_id: z.string(),
  number: z.string(),
  // `.nullish()` (rather than `.nullable()`) so a projected-away field (absent key, because the
  // caller restricted `fields`) parses the same way a `null` value already does.
  short_description: z.string().nullish(),
  priority: z.string().nullish(),
  state: z.string().nullish(),
  opened_at: z.string().nullish(),
});
export type Incident = z.infer<typeof IncidentSchema>;

// Row shape for the generic list_records/get_record tools: an identity (`sys_id`) plus an
// arbitrary set of display-value fields. `.catchall()` rejects nested objects/arrays the same
// way `additionalFields` validation does on the write path.
export const GenericRecordSchema = z
  .object({ sys_id: z.string() })
  .catchall(z.union([z.string(), z.null()]));
export type GenericRecord = z.infer<typeof GenericRecordSchema>;

// Fields writable via the incident CRUD tools, keyed by the ServiceNow
// field name. Passing sysparm_input_display_value=true on write lets callers
// use human-readable choice labels (e.g. "Resolved", "1 - Critical") instead
// of ServiceNow's internal numeric codes.
export type WritableIncidentFields = {
  short_description?: string;
  description?: string;
  urgency?: string;
  impact?: string;
  priority?: string;
  state?: string;
  category?: string;
  assignment_group?: string;
  work_notes?: string;
  close_notes?: string;
  close_code?: string;
};

export interface PageResult<T> {
  records: T[];
  hasMore: boolean;
  nextCursor: string | null;
  returnedCount: number;
  totalCount?: number;
}

interface DateFilter {
  field: string;
  after?: string;
  before?: string;
}

function getInstanceUrl(authInfo?: AuthInfo): string | null {
  if (!authInfo?.extra) {
    return null;
  }
  const servicenowInstanceUrl = authInfo.extra.servicenow_instance_url;
  if (!isString(servicenowInstanceUrl)) {
    return null;
  }
  return servicenowInstanceUrl.trim().replace(/\/$/, "");
}

// Converts an ISO 8601 timestamp into the "YYYY-MM-DD HH:mm:ss" format ServiceNow's encoded
// query syntax expects for date/time comparisons, interpreted in UTC.
function toServiceNowDateTime(iso: string): Result<string, MCPError> {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return new Err(
      new MCPError(
        `Invalid date: "${iso}". Expected an ISO 8601 timestamp, e.g. "2026-01-15T00:00:00Z".`,
        { tracked: false }
      )
    );
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const formatted =
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
  return new Ok(formatted);
}

// Joins encoded-query clauses with "^" (AND) and always appends a deterministic sort on the
// immutable sys_id key. Deterministic ordering is what makes cursor pagination safe: without it,
// ServiceNow's default ordering isn't guaranteed stable across requests, and a paging session can
// skip or duplicate records.
function buildEncodedQuery(parts: Array<string | undefined>): string {
  const clauses = parts.filter((p): p is string => Boolean(p && p.length > 0));
  return clauses.length > 0
    ? `${clauses.join("^")}^ORDERBYsys_id`
    : "ORDERBYsys_id";
}

function contextPrefixForStatus(status: number): string | undefined {
  switch (status) {
    case 401:
    case 403:
      return "ServiceNow denied access (check authorization/ACLs on the target record or table)";
    case 429:
      return "ServiceNow rate limit exceeded, retry after a delay";
    default:
      return undefined;
  }
}

async function errorFromResponse(response: Response): Promise<MCPError> {
  const errorBody = await response.text();
  let message = `ServiceNow API error: ${response.status} ${response.statusText}`;
  let detail: string | undefined;
  try {
    const errorJson = JSON.parse(errorBody);
    const apiMessage = errorJson.error?.message;
    detail = errorJson.error?.detail;
    if (apiMessage) {
      message = apiMessage;
    }
  } catch {
    message = `${message} - ${errorBody}`;
  }

  const body = detail ? `${message}: ${detail}` : message;
  const prefix = contextPrefixForStatus(response.status);

  return new MCPError(prefix ? `${prefix}: ${body}` : body, {
    tracked: response.status >= 500,
    code: response.status,
  });
}

async function request<T extends z.ZodTypeAny>(
  {
    url,
    accessToken,
    method,
    body,
  }: {
    url: string;
    accessToken: string;
    method: "GET" | "POST" | "PATCH";
    body?: Record<string, unknown>;
  },
  schema: T
): Promise<Result<z.infer<T>, MCPError>> {
  const response = await untrustedFetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    ...(body && { body: JSON.stringify(body) }),
  });

  if (!response.ok) {
    return new Err(await errorFromResponse(response));
  }

  const responseText = await response.text();
  if (!responseText) {
    return new Err(new MCPError("Empty response from ServiceNow API"));
  }

  const rawData = JSON.parse(responseText);
  const parseResult = schema.safeParse(rawData);

  if (!parseResult.success) {
    const msg = `Invalid ServiceNow response format: ${parseResult.error.message}`;
    return new Err(new MCPError(msg));
  }

  return new Ok(parseResult.data);
}

class ServiceNowClient {
  constructor(
    private readonly accessToken: string,
    private readonly instanceUrl: string
  ) {}

  private get<T extends z.ZodTypeAny>(
    endpoint: string,
    schema: T
  ): Promise<Result<z.infer<T>, MCPError>> {
    return request(
      {
        url: `${this.instanceUrl}${endpoint}`,
        accessToken: this.accessToken,
        method: "GET",
      },
      schema
    );
  }

  private mutate<T extends z.ZodTypeAny>(
    endpoint: string,
    method: "POST" | "PATCH",
    body: Record<string, unknown>,
    schema: T
  ): Promise<Result<z.infer<T>, MCPError>> {
    return request(
      {
        url: `${this.instanceUrl}${endpoint}`,
        accessToken: this.accessToken,
        method,
        body,
      },
      schema
    );
  }

  // Shared pagination primitive backing both `listIncidents` (fixed to the `incident` table,
  // typed rows) and the generic `listRecords` tool (caller-selected table, generic rows).
  // Fetches one extra row beyond the page size to detect `hasMore` without a second round-trip,
  // and uses keyset pagination on `sys_id` (rather than sysparm_offset) so that records inserted
  // or deleted between calls can't cause a page to skip or duplicate rows.
  private async fetchPage<R extends { sys_id: string }>(
    table: string,
    {
      query,
      fields,
      cursor,
      limit,
      dateFilters,
      includeTotalCount,
      forceFields,
    }: {
      query?: string;
      fields?: string[];
      cursor?: string;
      limit?: number;
      dateFilters?: DateFilter[];
      includeTotalCount?: boolean;
      forceFields: string[];
    },
    recordSchema: z.ZodType<R>
  ): Promise<Result<PageResult<R>, MCPError>> {
    if (!isValidTableName(table)) {
      return new Err(
        new MCPError(
          `Invalid table name: "${table}". Expected a ServiceNow table identifier, e.g. "incident" or "u_custom_table".`,
          { tracked: false }
        )
      );
    }

    if (cursor !== undefined && !isValidSysId(cursor)) {
      return new Err(
        new MCPError(`Invalid cursor: "${cursor}".`, { tracked: false })
      );
    }

    const dateFilterClauses: string[] = [];
    for (const filter of dateFilters ?? []) {
      if (filter.after !== undefined) {
        const formatted = toServiceNowDateTime(filter.after);
        if (formatted.isErr()) {
          return formatted;
        }
        dateFilterClauses.push(`${filter.field}>=${formatted.value}`);
      }
      if (filter.before !== undefined) {
        const formatted = toServiceNowDateTime(filter.before);
        if (formatted.isErr()) {
          return formatted;
        }
        dateFilterClauses.push(`${filter.field}<=${formatted.value}`);
      }
    }

    // Built without the cursor clause: this is the query that defines the full result set
    // (used for the total-count request below), independent of which page we're on.
    const baseQuery = buildEncodedQuery([query, ...dateFilterClauses]);
    const cursorClause = cursor ? `sys_id>${cursor}` : undefined;
    const encodedQuery = buildEncodedQuery([
      query,
      ...dateFilterClauses,
      cursorClause,
    ]);

    const pageLimit = Math.min(
      Math.max(limit ?? DEFAULT_LIST_LIMIT, 1),
      MAX_PAGE_LIMIT
    );

    const params = new URLSearchParams();
    // Ask for one more row than the page size to detect `hasMore` cheaply.
    params.set("sysparm_limit", String(pageLimit + 1));
    params.set("sysparm_display_value", "true");
    params.set("sysparm_query", encodedQuery);

    if (fields) {
      const projected = Array.from(new Set([...forceFields, ...fields]));
      for (const field of projected) {
        if (!FIELD_NAME_REGEX.test(field)) {
          return new Err(
            new MCPError(`Invalid field name: "${field}".`, {
              tracked: false,
            })
          );
        }
      }
      params.set("sysparm_fields", projected.join(","));
    }

    const result = await this.get(
      `/api/now/table/${table}?${params.toString()}`,
      z.object({ result: z.array(recordSchema) })
    );

    if (result.isErr()) {
      return result;
    }

    const rows = result.value.result;
    const hasMore = rows.length > pageLimit;
    const page = hasMore ? rows.slice(0, pageLimit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].sys_id : null;

    let totalCount: number | undefined;
    if (includeTotalCount) {
      const countResult = await this.getTotalCount(table, baseQuery);
      if (countResult.isErr()) {
        return countResult;
      }
      totalCount = countResult.value;
    }

    return new Ok({
      records: page,
      hasMore,
      nextCursor,
      returnedCount: page.length,
      totalCount,
    });
  }

  // Counting is a separate, explicit opt-in request (rather than always requesting
  // sysparm_no_count=false) since an exact count is a materially more expensive query on large
  // tables than the page fetch itself.
  private async getTotalCount(
    table: string,
    encodedQuery: string
  ): Promise<Result<number, MCPError>> {
    const params = new URLSearchParams();
    params.set("sysparm_query", encodedQuery);
    params.set("sysparm_limit", "1");
    params.set("sysparm_no_count", "false");
    params.set("sysparm_fields", "sys_id");

    const response = await untrustedFetch(
      `${this.instanceUrl}/api/now/table/${table}?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return new Err(await errorFromResponse(response));
    }

    const totalCountHeader = response.headers.get("X-Total-Count");
    const totalCount =
      totalCountHeader !== null ? Number(totalCountHeader) : NaN;
    if (!Number.isFinite(totalCount)) {
      return new Err(
        new MCPError(
          "ServiceNow did not return a total count for this query.",
          { tracked: false }
        )
      );
    }

    return new Ok(totalCount);
  }

  async listIncidents({
    query,
    fields,
    cursor,
    limit,
    openedAfter,
    openedBefore,
    updatedAfter,
    updatedBefore,
    includeTotalCount,
  }: {
    query?: string;
    fields?: string[];
    cursor?: string;
    limit?: number;
    openedAfter?: string;
    openedBefore?: string;
    updatedAfter?: string;
    updatedBefore?: string;
    includeTotalCount?: boolean;
  }): Promise<Result<PageResult<Incident>, MCPError>> {
    return this.fetchPage(
      "incident",
      {
        query,
        fields,
        cursor,
        limit,
        dateFilters: [
          { field: "opened_at", after: openedAfter, before: openedBefore },
          {
            field: "sys_updated_on",
            after: updatedAfter,
            before: updatedBefore,
          },
        ],
        includeTotalCount,
        forceFields: ["sys_id", "number"],
      },
      IncidentSchema
    );
  }

  async getIncidentByNumber(
    incidentNumber: string
  ): Promise<Result<Incident | null, MCPError>> {
    // ServiceNow's encoded query syntax treats "^" as a condition separator (and
    // "=" as an operator), so passing it through unescaped would let a caller
    // turn this exact-number lookup into an arbitrary compound query.
    if (/[\^=]/.test(incidentNumber)) {
      return new Err(
        new MCPError(
          `Invalid incident number: "${incidentNumber}". Expected a plain incident number, e.g. "INC0010001".`,
          { tracked: false }
        )
      );
    }

    const params = new URLSearchParams();
    params.set("sysparm_query", `number=${incidentNumber}`);
    params.set("sysparm_limit", "1");
    params.set("sysparm_display_value", "true");

    const result = await this.get(
      `/api/now/table/incident?${params.toString()}`,
      z.object({ result: z.array(IncidentSchema) })
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok(result.value.result[0] ?? null);
  }

  async createIncident(
    fields: Record<string, string | number | boolean | null>
  ): Promise<Result<Incident, MCPError>> {
    const result = await this.mutate(
      "/api/now/table/incident?sysparm_display_value=true&sysparm_input_display_value=true",
      "POST",
      fields,
      z.object({ result: IncidentSchema })
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok(result.value.result);
  }

  async updateIncident(
    sysId: string,
    fields: Record<string, string | number | boolean | null>
  ): Promise<Result<Incident, MCPError>> {
    const result = await this.mutate(
      `/api/now/table/incident/${encodeURIComponent(sysId)}?sysparm_display_value=true&sysparm_input_display_value=true`,
      "PATCH",
      fields,
      z.object({ result: IncidentSchema })
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok(result.value.result);
  }

  // Generic, read-only listing across any table the connected account has access to. Shares
  // the same keyset pagination, ordering, and field-projection behavior as `listIncidents`.
  async listRecords(
    table: string,
    {
      query,
      fields,
      cursor,
      limit,
      createdAfter,
      createdBefore,
      updatedAfter,
      updatedBefore,
      includeTotalCount,
    }: {
      query?: string;
      fields?: string[];
      cursor?: string;
      limit?: number;
      createdAfter?: string;
      createdBefore?: string;
      updatedAfter?: string;
      updatedBefore?: string;
      includeTotalCount?: boolean;
    }
  ): Promise<Result<PageResult<GenericRecord>, MCPError>> {
    return this.fetchPage(
      table,
      {
        query,
        fields,
        cursor,
        limit,
        dateFilters: [
          {
            field: "sys_created_on",
            after: createdAfter,
            before: createdBefore,
          },
          {
            field: "sys_updated_on",
            after: updatedAfter,
            before: updatedBefore,
          },
        ],
        includeTotalCount,
        forceFields: ["sys_id"],
      },
      GenericRecordSchema
    );
  }

  // Generic, read-only single-record lookup by sys_id, the one identifier that's both universal
  // across tables and safe to interpolate directly into the request path.
  async getRecord(
    table: string,
    sysId: string,
    fields?: string[]
  ): Promise<Result<GenericRecord | null, MCPError>> {
    if (!isValidTableName(table)) {
      return new Err(
        new MCPError(
          `Invalid table name: "${table}". Expected a ServiceNow table identifier, e.g. "incident" or "u_custom_table".`,
          { tracked: false }
        )
      );
    }

    if (!isValidSysId(sysId)) {
      return new Err(
        new MCPError(
          `Invalid sys_id: "${sysId}". Expected a 32-character hexadecimal identifier.`,
          { tracked: false }
        )
      );
    }

    const params = new URLSearchParams();
    params.set("sysparm_display_value", "true");
    if (fields) {
      const projected = Array.from(new Set(["sys_id", ...fields]));
      for (const field of projected) {
        if (!FIELD_NAME_REGEX.test(field)) {
          return new Err(
            new MCPError(`Invalid field name: "${field}".`, {
              tracked: false,
            })
          );
        }
      }
      params.set("sysparm_fields", projected.join(","));
    }

    const result = await this.get(
      `/api/now/table/${table}/${encodeURIComponent(sysId)}?${params.toString()}`,
      z.object({ result: GenericRecordSchema })
    );

    if (result.isErr()) {
      // ServiceNow returns 404 for a sys_id that doesn't exist (or isn't visible under ACLs);
      // surface that as "not found" rather than as an error.
      if (result.error.code === 404) {
        return new Ok(null);
      }
      return result;
    }

    return new Ok(result.value.result);
  }
}

export function createServiceNowClient(
  authInfo?: AuthInfo
): Result<ServiceNowClient, MCPError> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError("No access token found"));
  }

  const instanceUrl = getInstanceUrl(authInfo);
  if (!instanceUrl) {
    return new Err(
      new MCPError(
        "Instance URL not found in connection metadata. Please reconnect your ServiceNow account.",
        { tracked: false }
      )
    );
  }

  return new Ok(new ServiceNowClient(accessToken, instanceUrl));
}
