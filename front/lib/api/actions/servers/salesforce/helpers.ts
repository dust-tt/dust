import { MCPError, ProviderError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import logger from "@app/logger/logger";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Connection } from "jsforce";
import jsforce from "jsforce";

export const SF_API_VERSION = "57.0";

const SALESFORCE_HTTP_ERROR_CODE_PATTERN = /^ERROR_HTTP_(\d{3})$/;

/**
 * Converts a jsforce error into a ProviderError when the underlying HTTP status is >= 500.
 * jsforce surfaces HTTP-level failures without a parseable Salesforce error body as
 * `HttpApiError` with `errorCode` set to `ERROR_HTTP_<status>` (see jsforce lib/http-api.js).
 * User-driven failures (bad SOQL, unknown fields, permissions) carry Salesforce error codes
 * such as `MALFORMED_QUERY` instead and must not be treated as provider failures. jsforce
 * does not export its error class, so detection is structural on `errorCode`.
 */
export function toSalesforceProviderError(
  error: unknown
): ProviderError | null {
  if (!(error instanceof Error) || !("errorCode" in error)) {
    return null;
  }
  const { errorCode } = error;
  if (typeof errorCode !== "string") {
    return null;
  }
  const match = SALESFORCE_HTTP_ERROR_CODE_PATTERN.exec(errorCode);
  if (!match) {
    return null;
  }
  const status = parseInt(match[1], 10);
  if (status < 500) {
    return null;
  }
  return new ProviderError(
    `Salesforce API returned an unexpected error (HTTP ${status}).`,
    { status, cause: error }
  );
}

export async function withAuth(
  { authInfo }: ToolHandlerExtra,
  action: (conn: Connection) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const accessToken = authInfo?.token;
  const instanceUrl = authInfo?.extra?.instance_url;

  if (typeof instanceUrl !== "string") {
    return new Err(new MCPError("Missing or invalid instance_url in authInfo"));
  }

  const conn = new jsforce.Connection({
    instanceUrl,
    accessToken,
    version: SF_API_VERSION,
  });

  try {
    await conn.identity();
  } catch (error) {
    const providerError = toSalesforceProviderError(error);
    if (providerError) {
      throw providerError;
    }
    return new Err(
      new MCPError(
        `Failed to authenticate with Salesforce: ${normalizeError(error).message}`
      )
    );
  }

  return action(conn);
}

export function logAndReturnError({
  error,
  params,
  message,
}: {
  error: unknown;
  params: Record<string, unknown>;
  message: string;
}): ToolHandlerResult {
  // Salesforce-side failures (HTTP >= 500) are thrown so they reach the tool wrapper and
  // alert, instead of being returned as a plain tool error.
  const providerError = toSalesforceProviderError(error);
  if (providerError) {
    throw providerError;
  }
  const normalizedError = normalizeError(error);
  logger.error(
    { params, error: normalizedError.message },
    `Salesforce MCP: ${message}`
  );
  return new Err(new MCPError(`${message}: ${normalizedError.message}`));
}
