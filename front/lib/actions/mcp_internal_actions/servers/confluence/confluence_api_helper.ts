import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";

import type {
  ConfluenceCreatePageRequest,
  ConfluenceCurrentUser,
  ConfluenceErrorResult,
  ConfluenceListPagesResult,
  ConfluencePage,
  ConfluenceSearchRequest,
  ConfluenceUpdatePageRequest,
  UpdatePagePayload,
  WithAuthParams,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";
import {
  AtlassianResourceSchema,
  ConfluenceCurrentUserSchema,
  ConfluenceListPagesResultSchema,
  ConfluencePageSchema,
  CreatePagePayloadSchema,
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
      const msg = `Invalid Confluence response format: ${parseResult.error.message}`;
      return logAndReturnApiError({
        error: new Error(msg),
        message: "Confluence attachment upload response format invalid",
      });
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

// Get Confluence resource information using the access token
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

function logAndReturnApiError<T>({
  error,
  message,
}: {
  error: unknown;
  message: string;
}): Result<T, string> {
  logger.error(`[Confluence MCP Server] ${message}`);
  return new Err(normalizeError(error).message);
}

export async function listPages(
  baseUrl: string,
  accessToken: string,
  params: ConfluenceSearchRequest
): Promise<Result<ConfluenceListPagesResult, string>> {
  // Validate limit with clear error messages
  const limit = params.limit ?? 25;
  if (limit < 1) {
    return new Err("Limit must be at least 1");
  }
  if (limit > 250) {
    return new Err("Limit cannot exceed 250 (Confluence API limitation)");
  }

  const searchParams = new URLSearchParams();

  if (params.cql) {
    searchParams.append("body-format", "storage");
  }
  if (params.cursor) {
    searchParams.append("cursor", params.cursor);
  }
  searchParams.append("limit", limit.toString());

  const endpoint = `/wiki/api/v2/pages?${searchParams.toString()}`;

  const result = await confluenceApiCall(
    {
      endpoint,
      accessToken,
    },
    ConfluenceListPagesResultSchema,
    {
      baseUrl,
    }
  );

  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(result.value);
}

export async function createPage(
  baseUrl: string,
  accessToken: string,
  createData: ConfluenceCreatePageRequest
): Promise<Result<ConfluencePage, string>> {
  const endpoint = `/wiki/api/v2/pages`;

  const payloadData = {
    spaceId: createData.spaceId,
    title: createData.title,
    status: createData.status,
    parentId: createData.parentId,
    body: createData.body,
  };

  const parseResult = CreatePagePayloadSchema.safeParse(payloadData);
  if (!parseResult.success) {
    return new Err(`Invalid payload data: ${parseResult.error.message}`);
  }

  const payload = parseResult.data;

  const result = await confluenceApiCall(
    {
      endpoint,
      accessToken,
    },
    ConfluencePageSchema,
    {
      method: "POST",
      body: payload,
      baseUrl,
    }
  );

  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(result.value);
}

export async function updatePage(
  baseUrl: string,
  accessToken: string,
  updateData: ConfluenceUpdatePageRequest
): Promise<Result<ConfluencePage, string>> {
  const currentPageResult = await getPage(
    baseUrl,
    accessToken,
    updateData.id,
    false
  );
  if (currentPageResult.isErr()) {
    return new Err(
      `Failed to get current page data: ${currentPageResult.error}`
    );
  }

  if (currentPageResult.value === null) {
    return new Err(`Page with id ${updateData.id} not found`);
  }

  const currentPage = currentPageResult.value;
  const endpoint = `/wiki/api/v2/pages/${updateData.id}`;

  // Helper function to construct update payload
  const buildUpdatePagePayload = (
    updateData: ConfluenceUpdatePageRequest,
    currentPage: ConfluencePage
  ): UpdatePagePayload => {
    const payload: UpdatePagePayload = {
      id: updateData.id,
      version: updateData.version,
      status: updateData.status ?? (currentPage.status || "current"),
      title: updateData.title ?? currentPage.title,
    };

    if (updateData.spaceId ?? currentPage.spaceId) {
      payload.spaceId = updateData.spaceId ?? currentPage.spaceId;
    }
    if (updateData.parentId ?? currentPage.parentId) {
      payload.parentId =
        updateData.parentId ?? currentPage.parentId ?? undefined;
    }

    if (updateData.body) {
      payload.body = {
        value: updateData.body.value,
        representation: updateData.body.representation,
      };
    }

    return payload;
  };

  const payload = buildUpdatePagePayload(updateData, currentPage);

  const result = await confluenceApiCall(
    {
      endpoint,
      accessToken,
    },
    ConfluencePageSchema,
    {
      method: "PUT",
      body: payload,
      baseUrl,
    }
  );

  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(result.value);
}

export async function getPage(
  baseUrl: string,
  accessToken: string,
  pageId: string,
  includeBody: boolean = false
): Promise<Result<ConfluencePage | null, string>> {
  const searchParams = new URLSearchParams();
  if (includeBody) {
    searchParams.append("body-format", "storage");
  }

  const endpoint = `/wiki/api/v2/pages/${pageId}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  const result = await confluenceApiCall(
    {
      endpoint,
      accessToken,
    },
    ConfluencePageSchema,
    {
      baseUrl,
    }
  );

  if (result.isErr()) {
    if (result.error.includes("404")) {
      return new Ok(null);
    }
    return new Err(result.error);
  }

  return new Ok(result.value);
}
