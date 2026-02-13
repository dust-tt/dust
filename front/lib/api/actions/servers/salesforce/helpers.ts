import type { Connection } from "jsforce";
import jsforce from "jsforce";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import logger from "@app/logger/logger";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export const SF_API_VERSION = "57.0";

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
  const normalizedError = normalizeError(error);
  logger.error(
    { params, error: normalizedError.message },
    `Salesforce MCP: ${message}`
  );
  return new Err(new MCPError(`${message}: ${normalizedError.message}`));
}
