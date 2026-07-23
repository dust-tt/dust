import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

const DEFAULT_INCIDENT_LIMIT = 25;

export const IncidentSchema = z.object({
  sys_id: z.string(),
  number: z.string(),
  short_description: z.string().nullable(),
  priority: z.string().nullable(),
  state: z.string().nullable(),
  opened_at: z.string().nullable(),
});
export type Incident = z.infer<typeof IncidentSchema>;

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
    const errorBody = await response.text();
    let errorMessage = `ServiceNow API error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      const message = errorJson.error?.message;
      const detail = errorJson.error?.detail;
      if (message) {
        errorMessage = detail ? `${message}: ${detail}` : message;
      }
    } catch {
      errorMessage = `${errorMessage} - ${errorBody}`;
    }
    return new Err(
      new MCPError(errorMessage, { tracked: response.status >= 500 })
    );
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

export class ServiceNowClient {
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

  async listIncidents({
    query,
    limit,
  }: {
    query?: string;
    limit?: number;
  }): Promise<Result<Incident[], MCPError>> {
    const params = new URLSearchParams();
    params.set("sysparm_limit", String(limit ?? DEFAULT_INCIDENT_LIMIT));
    // Return human-readable labels (e.g. "Critical", "New") for choice fields
    // like state/priority instead of ServiceNow's raw internal codes.
    params.set("sysparm_display_value", "true");
    if (query) {
      params.set("sysparm_query", query);
    }

    const result = await this.get(
      `/api/now/table/incident?${params.toString()}`,
      z.object({ result: z.array(IncidentSchema) })
    );

    if (result.isErr()) {
      return result;
    }

    return new Ok(result.value.result);
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
    fields: WritableIncidentFields
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
    fields: WritableIncidentFields
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
