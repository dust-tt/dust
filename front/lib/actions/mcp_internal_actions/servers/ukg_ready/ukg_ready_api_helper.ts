import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  UkgReadyEmployee,
  UkgReadyErrorResult,
  UkgReadyPTORequest,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/types";
import {
  UkgReadyEmployeeSchema,
  UkgReadyPTORequestsResponseSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/ukg_ready/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Generic wrapper for UKG Ready API calls with validation
async function ukgReadyApiCall<T extends z.ZodTypeAny>(
  {
    endpoint,
    accessToken,
    instanceUrl,
    companyId,
  }: {
    endpoint: string;
    accessToken: string;
    instanceUrl: string;
    companyId: string;
  },
  schema: T
): Promise<Result<z.infer<T>, UkgReadyErrorResult>> {
  try {
    // Use !{companyId} format per UKG Ready docs for company reference
    const url = `${instanceUrl}/ta/rest/v2/companies/!${companyId}${endpoint}`;

    const response = await untrustedFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const msg = `UKG Ready API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(`[UKG Ready MCP Server] ${msg}`);
      return new Err(msg);
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Ok(undefined as z.infer<T>);
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid UKG Ready response format: ${parseResult.error.message}`;
      logger.error(`[UKG Ready MCP Server] ${msg}`);
      return new Err(msg);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    logger.error(
      `[UKG Ready MCP Server] UKG Ready API call failed for ${endpoint}:`
    );
    return new Err(normalizeError(error).message);
  }
}

export async function withAuth({
  authInfo,
  action,
}: {
  authInfo?: AuthInfo;
  action: (
    accessToken: string,
    instanceUrl: string,
    companyId: string
  ) => Promise<Result<CallToolResult["content"], MCPError>>;
}): Promise<Result<CallToolResult["content"], MCPError>> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(
      new MCPError(
        "No access token found. Please connect your UKG Ready account."
      )
    );
  }

  const instanceUrl = authInfo?.extra?.instance_url;
  if (!instanceUrl || typeof instanceUrl !== "string") {
    return new Err(
      new MCPError(
        "No UKG Ready instance URL found. Please reconnect your account."
      )
    );
  }

  const companyId = authInfo?.extra?.ukg_ready_company_id;
  if (!companyId || typeof companyId !== "string") {
    return new Err(
      new MCPError(
        "No UKG Ready company ID found. Please reconnect your account."
      )
    );
  }

  return action(accessToken, instanceUrl, companyId);
}

export async function getCurrentEmployee(
  accessToken: string,
  instanceUrl: string,
  companyId: string
): Promise<Result<UkgReadyEmployee, UkgReadyErrorResult>> {
  const endpoint = `/employees/me`;

  const result = await ukgReadyApiCall(
    { endpoint, accessToken, instanceUrl, companyId },
    UkgReadyEmployeeSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value);
}

export async function getAllPTORequests(
  accessToken: string,
  instanceUrl: string,
  companyId: string,
  filters?: {
    fromDate?: string;
    toDate?: string;
    sort?: string;
  }
): Promise<Result<UkgReadyPTORequest[], UkgReadyErrorResult>> {
  const params = new URLSearchParams();

  if (filters?.fromDate) {
    params.set("fromDate", filters.fromDate);
  }
  if (filters?.toDate) {
    params.set("toDate", filters.toDate);
  }
  if (filters?.sort) {
    params.set("sort", filters.sort);
  }

  const queryString = params.toString();
  const endpoint = `/employee/ptorequest${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    { endpoint, accessToken, instanceUrl, companyId },
    UkgReadyPTORequestsResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.ptorequests);
}
