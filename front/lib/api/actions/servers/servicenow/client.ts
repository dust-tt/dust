import { MCPError, ProviderError } from "@app/lib/actions/mcp_errors";
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

async function servicenowApiCall<T extends z.ZodTypeAny>(
  {
    endpoint,
    accessToken,
    instanceUrl,
  }: {
    endpoint: string;
    accessToken: string;
    instanceUrl: string;
  },
  schema: T
): Promise<Result<z.infer<T>, MCPError>> {
  const url = `${instanceUrl}${endpoint}`;

  const response = await untrustedFetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status >= 500) {
    throw new ProviderError(
      `ServiceNow API returned an unexpected error (HTTP ${response.status}).`,
      { status: response.status }
    );
  }

  if (!response.ok) {
    const errorBody = await response.text();
    let errorMessage = `ServiceNow API error: ${response.status} ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorBody);
      errorMessage = errorJson.error?.message ?? errorMessage;
    } catch {
      errorMessage = `${errorMessage} - ${errorBody}`;
    }
    return new Err(new MCPError(errorMessage, { tracked: false }));
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

export async function listIncidents(
  accessToken: string,
  instanceUrl: string,
  { query, limit }: { query?: string; limit?: number }
): Promise<Result<Incident[], MCPError>> {
  const params = new URLSearchParams();
  params.set("sysparm_limit", String(limit ?? DEFAULT_INCIDENT_LIMIT));
  // Return human-readable labels (e.g. "Critical", "New") for choice fields
  // like state/priority instead of ServiceNow's raw internal codes.
  params.set("sysparm_display_value", "true");
  if (query) {
    params.set("sysparm_query", query);
  }

  const result = await servicenowApiCall(
    {
      endpoint: `/api/now/table/incident?${params.toString()}`,
      accessToken,
      instanceUrl,
    },
    z.object({ result: z.array(IncidentSchema) })
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.result);
}

export function getServiceNowCredentials(
  authInfo?: AuthInfo
): Result<{ accessToken: string; instanceUrl: string }, MCPError> {
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

  return new Ok({ accessToken, instanceUrl });
}
