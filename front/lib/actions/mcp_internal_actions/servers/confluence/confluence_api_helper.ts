import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import type {
  ConfluenceCurrentUser,
  ConfluenceErrorResult,
  WithAuthParams,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";
import {
  AtlassianResourceSchema,
  ConfluenceCurrentUserSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Generic wrapper for Confluence API calls
async function confluenceApiCall<T extends z.ZodTypeAny>(
  {
    endpoint,
    accessToken,
  }: {
    endpoint: string;
    accessToken: string;
  },
  schema: T,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: Record<string, unknown>;
    baseUrl: string;
  }
): Promise<Result<z.infer<T>, ConfluenceErrorResult>> {
  try {
    const response = await fetch(`${options.baseUrl}${endpoint}`, {
      method: options.method ?? "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(options.body && { body: JSON.stringify(options.body) }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const msg = `Confluence API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(`[Confluence MCP Server] ${msg}`);
      return new Err(msg);
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Ok(undefined);
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.warn(
        `[Confluence MCP Server] Schema validation failed for ${endpoint}, returning raw data`,
        {
          error: parseResult.error,
          endpoint,
        }
      );
      return new Ok(rawData);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    logger.error(
      `[Confluence MCP Server] Confluence API call failed for ${endpoint}:`,
      {
        error,
      }
    );
    return new Err(normalizeError(error).message);
  }
}

export const withAuth = async ({
  authInfo,
  action,
}: WithAuthParams): Promise<CallToolResult> => {
  const accessToken = authInfo?.token;

  if (!accessToken) {
    return makeMCPToolTextError("No access token found");
  }

  try {
    const baseUrl = await getConfluenceBaseUrl(accessToken);
    if (!baseUrl) {
      return makeMCPToolTextError(
        "Failed to determine Confluence instance URL. Please check your connection."
      );
    }

    return await action(baseUrl, accessToken);
  } catch (error) {
    logger.error("Error in withAuth", { error });
    return makeMCPToolTextError(
      `Authentication error: ${normalizeError(error).message}`
    );
  }
};

async function getConfluenceBaseUrl(
  accessToken: string
): Promise<string | null> {
  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  if (resourceInfo?.id) {
    return `https://api.atlassian.com/ex/confluence/${resourceInfo.id}`;
  }
  return null;
}

//Get Confluence resource information using the access token
async function getConfluenceResourceInfo(
  accessToken: string
): Promise<{ id: string; name: string; url: string } | null> {
  const result = await confluenceApiCall(
    {
      endpoint: "/oauth/token/accessible-resources",
      accessToken,
    },
    AtlassianResourceSchema,
    {
      baseUrl: "https://api.atlassian.com",
    }
  );

  if (result.isErr()) {
    logger.error("Failed to get accessible resources", { error: result.error });
    return null;
  }

  const resources = result.value;
  if (!resources || resources.length === 0) {
    logger.error("No accessible resources found");
    return null;
  }
  const resource = resources[0];
  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
  };
}

export async function getCurrentUser(
  _baseUrl: string,
  accessToken: string
): Promise<Result<ConfluenceCurrentUser, string>> {
  const result = await confluenceApiCall(
    {
      endpoint: "/me",
      accessToken,
    },
    ConfluenceCurrentUserSchema,
    {
      baseUrl: "https://api.atlassian.com",
    }
  );

  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(result.value);
}
