import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  UkgReadyAccrualBalance,
  UkgReadyEmployee,
  UkgReadyErrorResult,
  UkgReadyExecuteResult,
  UkgReadyPTORequest,
  UkgReadyPTORequestNote,
  UkgReadyPTORequestObject,
  UkgReadySchedule,
} from "@app/lib/api/actions/servers/ukg_ready/types";
import {
  UkgReadyAccrualBalancesResponseSchema,
  UkgReadyEmployeeSchema,
  UkgReadyEmployeesResponseSchema,
  UkgReadyExecuteResultSchema,
  UkgReadyPTORequestNotesResponseSchema,
  UkgReadyPTORequestsResponseSchema,
  UkgReadySchedulesResponseSchema,
} from "@app/lib/api/actions/servers/ukg_ready/types";
import { untrustedFetch } from "@app/lib/egress/server";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { z } from "zod";

interface UkgReadyAuthContext {
  accessToken: string;
  instanceUrl: string;
  companyId: string;
}

// withAuth pattern - extracts token and provides consistent error handling
// biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
export async function withAuth(
  { authInfo }: ToolHandlerExtra,
  action: (ctx: UkgReadyAuthContext) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
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

  return action({ accessToken, instanceUrl, companyId });
}

// Generic wrapper for UKG Ready API calls with validation
async function ukgReadyApiCall<T extends z.ZodTypeAny>(
  {
    endpoint,
    accessToken,
    instanceUrl,
    companyId,
    method = "GET",
    body,
  }: {
    endpoint: string;
    accessToken: string;
    instanceUrl: string;
    companyId: string;
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: unknown;
  },
  schema: T
): Promise<Result<z.infer<T>, UkgReadyErrorResult>> {
  try {
    // Use !{companyId} format per UKG Ready docs for company reference
    const url = `${instanceUrl}/ta/rest/v2/companies/!${companyId}${endpoint}`;

    const response = await untrustedFetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const msg = `UKG Ready API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(msg);
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
      logger.error(msg);
      return new Err(msg);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    const errorMsg = `UKG Ready API call failed for ${endpoint}: ${normalizeError(error).message}`;
    logger.error(errorMsg);
    return new Err(normalizeError(error).message);
  }
}

export async function getCurrentEmployee(
  ctx: UkgReadyAuthContext
): Promise<Result<UkgReadyEmployee, UkgReadyErrorResult>> {
  const endpoint = `/employees/me`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadyEmployeeSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value);
}

export async function getAllPTORequests(
  ctx: UkgReadyAuthContext,
  filters?: {
    fromDate?: string;
    toDate?: string;
    sort?: string;
    usernames?: string[];
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
  if (filters?.usernames && filters.usernames.length > 0) {
    params.set("usernames", filters.usernames.join(","));
  }

  const queryString = params.toString();
  const endpoint = `/employee/ptorequest${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadyPTORequestsResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.ptorequests);
}

export async function getAccrualBalances(
  ctx: UkgReadyAuthContext,
  filters?: {
    accountId?: string;
    asOfDate?: string;
    timeoff?: number[];
  }
): Promise<Result<UkgReadyAccrualBalance[], UkgReadyErrorResult>> {
  let accountId: string;

  if (filters?.accountId) {
    accountId = filters.accountId;
  } else {
    const currentEmployeeResult = await getCurrentEmployee(ctx);

    if (currentEmployeeResult.isErr()) {
      return currentEmployeeResult;
    }

    accountId = currentEmployeeResult.value.id.toString();
  }

  const params = new URLSearchParams();

  if (filters?.asOfDate) {
    params.set("asOfDate", filters.asOfDate);
  }
  if (filters?.timeoff && filters.timeoff.length > 0) {
    params.set("timeoff", filters.timeoff.join(","));
  }

  const queryString = params.toString();
  const endpoint = `/employees/${accountId}/accrual/1/balances${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadyAccrualBalancesResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.accrual_balances);
}

export async function getPTORequestNotes(
  ctx: UkgReadyAuthContext,
  noteThreadId: string
): Promise<Result<UkgReadyPTORequestNote[], UkgReadyErrorResult>> {
  const params = new URLSearchParams();
  params.set("note_thread_id", noteThreadId);

  const queryString = params.toString();
  const endpoint = `/employee/ptorequest/notes${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadyPTORequestNotesResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.notes);
}

export async function createPTORequest(
  ctx: UkgReadyAuthContext,
  requestData: {
    pto_request: UkgReadyPTORequestObject;
  }
): Promise<Result<UkgReadyExecuteResult, UkgReadyErrorResult>> {
  const result = await ukgReadyApiCall(
    {
      endpoint: "/employee/ptorequest",
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
      method: "POST",
      body: requestData,
    },
    UkgReadyExecuteResultSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value);
}

export async function deletePTORequest(
  ctx: UkgReadyAuthContext,
  requestIds: string[],
  comment?: string
): Promise<Result<void, UkgReadyErrorResult>> {
  const params = new URLSearchParams();
  params.set("ids", requestIds.join(","));

  if (comment) {
    params.set("comment", comment);
  }

  const queryString = params.toString();
  const endpoint = `/employee/ptorequest${queryString ? `?${queryString}` : ""}`;

  try {
    const url = `${ctx.instanceUrl}/ta/rest/v2/companies/!${ctx.companyId}${endpoint}`;

    const response = await untrustedFetch(url, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${ctx.accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const msg = `UKG Ready API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(msg);
      return new Err(msg);
    }

    return new Ok(undefined);
  } catch (error: unknown) {
    const errorMsg = `Failed to delete PTO request(s) ${requestIds.join(", ")}: ${normalizeError(error).message}`;
    logger.error(errorMsg);
    return new Err(normalizeError(error).message);
  }
}

export async function getSchedules(
  ctx: UkgReadyAuthContext,
  filters?: {
    username?: string;
    fromDate?: string;
    toDate?: string;
  }
): Promise<Result<UkgReadySchedule[], UkgReadyErrorResult>> {
  const params = new URLSearchParams();

  if (filters?.username) {
    params.set("username", filters.username);
  }
  if (filters?.fromDate) {
    params.set("fromDate", filters.fromDate);
  }
  if (filters?.toDate) {
    params.set("toDate", filters.toDate);
  }

  const queryString = params.toString();
  const endpoint = `/employee/schedules${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadySchedulesResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.schedules);
}

export async function getEmployees(
  ctx: UkgReadyAuthContext
): Promise<Result<UkgReadyEmployee[], UkgReadyErrorResult>> {
  const params = new URLSearchParams();

  params.set("terminated", "false");

  const queryString = params.toString();
  const endpoint = `/employees${queryString ? `?${queryString}` : ""}`;

  const result = await ukgReadyApiCall(
    {
      endpoint,
      accessToken: ctx.accessToken,
      instanceUrl: ctx.instanceUrl,
      companyId: ctx.companyId,
    },
    UkgReadyEmployeesResponseSchema
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.employees);
}
