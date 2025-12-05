import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { untrustedFetch } from "@app/lib/egress";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types";

import type { Warehouse } from "./types";
import { WarehouseSchema } from "./types";

function getWorkspaceUrl(authInfo?: AuthInfo): string | null {
  if (!authInfo?.extra) {
    return null;
  }
  const databricksWorkspaceUrl = authInfo.extra.databricks_workspace_url;
  return databricksWorkspaceUrl ?? null;
}

async function databricksApiCall<T extends z.ZodTypeAny>(
  {
    endpoint,
    accessToken,
    workspaceUrl,
  }: {
    endpoint: string;
    accessToken: string;
    workspaceUrl: string;
  },
  schema: T,
  options: {
    method?: "GET";
    body?: Record<string, unknown>;
  } = {}
): Promise<Result<z.infer<T>, string>> {
  try {
    const baseUrl = workspaceUrl.trim().replace(/\/$/, "");
    const url = `${baseUrl}${endpoint}`;

    const response = await untrustedFetch(url, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      ...(options.body && { body: JSON.stringify(options.body) }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      let errorMessage = `Databricks API error: ${response.status} ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorBody);
        errorMessage = errorJson.message ?? errorJson.error ?? errorMessage;
      } catch {
        errorMessage = `${errorMessage} - ${errorBody}`;
      }
      logger.error(`[Databricks MCP Server] ${errorMessage}`);
      return new Err(errorMessage);
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err("Empty response from Databricks API");
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid Databricks response format: ${parseResult.error.message}`;
      logger.error(`[Databricks MCP Server] ${msg}`);
      return new Err(msg);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    const errorMessage = normalizeError(error).message;
    logger.error(
      `[Databricks MCP Server] API call failed for ${endpoint}:`,
      error
    );
    return new Err(errorMessage);
  }
}

// List SQL warehouses
export async function listWarehouses(
  accessToken: string,
  workspaceUrl: string
): Promise<Result<Warehouse[], MCPError>> {
  const endpoint = "/api/2.0/sql/warehouses/";

  const result = await databricksApiCall(
    { endpoint, accessToken, workspaceUrl },
    z.object({ warehouses: z.array(WarehouseSchema) }),
    { method: "GET" }
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.warehouses);
}

export const withAuth = async ({
  authInfo,
  action,
}: {
  authInfo?: AuthInfo;
  action: (
    accessToken: string,
    workspaceUrl: string
  ) => Promise<Result<CallToolResult["content"], MCPError>>;
}): Promise<Result<CallToolResult["content"], MCPError>> => {
  const accessToken = authInfo?.token;

  if (!accessToken) {
    return new Err(new MCPError("No access token found"));
  }

  const workspaceUrl = getWorkspaceUrl(authInfo);
  if (!workspaceUrl) {
    return new Err(
      new MCPError(
        "Workspace URL not found in connection metadata. Please reconnect your Databricks account."
      )
    );
  }

  try {
    return await action(accessToken, workspaceUrl);
  } catch (error: unknown) {
    logger.error("Error in withAuth", { error });
    return new Err(
      new MCPError(`Authentication error: ${normalizeError(error).message}`)
    );
  }
};
