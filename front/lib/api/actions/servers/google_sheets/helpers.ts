import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getGoogleDriveClient,
  getGoogleSheetsClient,
} from "@app/lib/providers/google_drive/utils";
import logger from "@app/logger/logger";
import { Err } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { drive_v3, sheets_v4 } from "googleapis";

export const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "Failed to authenticate with Google",
  DRIVE_AUTH_FAILED: "Failed to authenticate with Google Drive",
  SHEETS_AUTH_FAILED: "Failed to authenticate with Google Sheets",
} as const;

/**
 * Wrapper to handle authentication and error logging for Google Sheets operations.
 * Provides access to both Drive and Sheets clients.
 */
export async function withAuth(
  { authInfo }: ToolHandlerExtra,
  action: (clients: {
    drive: drive_v3.Drive;
    sheets: sheets_v4.Sheets;
    accessToken: string;
  }) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError(ERROR_MESSAGES.NO_ACCESS_TOKEN));
  }

  const drive = getGoogleDriveClient(accessToken);
  const sheets = getGoogleSheetsClient(accessToken);

  try {
    return await action({ drive, sheets, accessToken });
  } catch (error: unknown) {
    return logAndReturnError({ error, message: "Operation failed" });
  }
}

/**
 * Wrapper specifically for operations that only need the Sheets client.
 */
export async function withSheetsAuth(
  { authInfo }: ToolHandlerExtra,
  action: (sheets: sheets_v4.Sheets) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError(ERROR_MESSAGES.SHEETS_AUTH_FAILED));
  }

  const sheets = getGoogleSheetsClient(accessToken);

  try {
    return await action(sheets);
  } catch (error: unknown) {
    return logAndReturnError({ error, message: "Operation failed" });
  }
}

/**
 * Wrapper specifically for operations that only need the Drive client.
 */
export async function withDriveAuth(
  { authInfo }: ToolHandlerExtra,
  action: (drive: drive_v3.Drive) => Promise<ToolHandlerResult>
): Promise<ToolHandlerResult> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return new Err(new MCPError(ERROR_MESSAGES.DRIVE_AUTH_FAILED));
  }

  const drive = getGoogleDriveClient(accessToken);

  try {
    return await action(drive);
  } catch (error: unknown) {
    return logAndReturnError({ error, message: "Operation failed" });
  }
}

export function logAndReturnError({
  error,
  params,
  message,
}: {
  error: unknown;
  params?: Record<string, unknown>;
  message: string;
}): ToolHandlerResult {
  logger.error(
    {
      error,
      ...params,
    },
    `[Google Sheets MCP Server] ${message}`
  );

  const normalizedError = normalizeError(error);

  return new Err(new MCPError(normalizedError.message || message));
}
