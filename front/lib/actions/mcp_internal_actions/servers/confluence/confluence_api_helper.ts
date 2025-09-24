import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type {
  ConfluenceCreatePageRequest,
  ConfluenceCurrentUser,
  ConfluenceListPagesRequest,
  ConfluenceListPagesResult,
  ConfluenceListSpacesRequest,
  ConfluenceListSpacesResult,
  ConfluencePage,
  ConfluenceUpdatePageRequest,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";
import {
  ConfluenceCurrentUserSchema,
  ConfluenceListPagesResultSchema,
  ConfluenceListSpacesResultSchema,
  ConfluencePageSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/confluence/types";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Schema for Atlassian resource information
const AtlassianResourceSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    scopes: z.array(z.string()).optional(),
    avatarUrl: z.string().optional(),
  })
);

type WithAuthParams = {
  authInfo?: AuthInfo;
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
};

type ConfluenceErrorResult = string;

// Generic wrapper for Confluence API calls with validation
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
    body?: any;
    baseUrl: string;
  }
): Promise<Result<z.infer<T>, ConfluenceErrorResult>> {
  try {
    const response = await fetch(`${options.baseUrl}${endpoint}`, {
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      method: options.method || "GET",
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

    // Allow any response - if schema validation fails, return raw data
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      logger.warn(
        `[Confluence MCP Server] Schema validation failed for ${endpoint}, returning raw data`,
        {
          error: parseResult.error,
          endpoint,
        }
      );
      // Return raw data instead of failing
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

/**
 * Get Confluence resource information using the access token
 */
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

  // Return the first accessible resource
  const resource = resources[0];
  return {
    id: resource.id,
    name: resource.name,
    url: resource.url,
  };
}

/**
 * Get the base URL for Confluence API calls
 */
async function getConfluenceBaseUrl(
  accessToken: string
): Promise<string | null> {
  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  if (resourceInfo?.id) {
    return `https://api.atlassian.com/ex/confluence/${resourceInfo.id}`;
  }
  return null;
}

/**
 * Helper function to handle authentication and make API calls
 */
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

/**
 * Get current user information - internal helper
 */
async function getCurrentUserInternal(
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

/**
 * List spaces with optional filtering - internal helper
 */
async function listSpacesInternal(
  baseUrl: string,
  accessToken: string,
  params: ConfluenceListSpacesRequest
): Promise<Result<ConfluenceListSpacesResult, string>> {
  const searchParams = new URLSearchParams();

  if (params.ids && params.ids.length > 0) {
    searchParams.append("ids", params.ids.join(","));
  }
  if (params.keys && params.keys.length > 0) {
    searchParams.append("keys", params.keys.join(","));
  }
  if (params.type) {
    searchParams.append("type", params.type);
  }
  if (params.status) {
    searchParams.append("status", params.status);
  }
  if (params.labels && params.labels.length > 0) {
    searchParams.append("labels", params.labels.join(","));
  }
  if (params.favourite !== undefined) {
    searchParams.append("favourite", params.favourite.toString());
  }
  if (params.sort) {
    searchParams.append("sort", params.sort);
  }
  if (params.cursor) {
    searchParams.append("cursor", params.cursor);
  }
  if (params.limit) {
    searchParams.append("limit", params.limit.toString());
  }

  const endpoint = `/wiki/api/v2/spaces?${searchParams.toString()}`;

  const result = await confluenceApiCall(
    {
      endpoint,
      accessToken,
    },
    ConfluenceListSpacesResultSchema,
    {
      baseUrl,
    }
  );

  if (result.isErr()) {
    return new Err(result.error);
  }

  return new Ok(result.value);
}

/**
 * List pages with optional filtering - internal helper
 */
async function listPagesInternal(
  baseUrl: string,
  accessToken: string,
  params: ConfluenceListPagesRequest
): Promise<Result<ConfluenceListPagesResult, string>> {
  const searchParams = new URLSearchParams();
  let endpoint: string;

  // If spaceId is provided, use the space-specific endpoint for better performance
  if (params.spaceId) {
    // Use /spaces/{id}/pages endpoint for space-specific listing
    endpoint = `/wiki/api/v2/spaces/${params.spaceId}/pages`;

    // For space-specific endpoint, don't include space-id in query params
    if (params.parentId) {
      searchParams.append("parent-id", params.parentId);
    }
    if (params.title) {
      searchParams.append("title", params.title);
    }
    if (params.status) {
      searchParams.append("status", params.status);
    }
    if (params.sort) {
      searchParams.append("sort", params.sort);
    }
    if (params.cursor) {
      searchParams.append("cursor", params.cursor);
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }
  } else {
    // Use general /pages endpoint for global listing
    endpoint = `/wiki/api/v2/pages`;

    if (params.parentId) {
      searchParams.append("parent-id", params.parentId);
    }
    if (params.title) {
      searchParams.append("title", params.title);
    }
    if (params.status) {
      searchParams.append("status", params.status);
    }
    if (params.sort) {
      searchParams.append("sort", params.sort);
    }
    if (params.cursor) {
      searchParams.append("cursor", params.cursor);
    }
    if (params.limit) {
      searchParams.append("limit", params.limit.toString());
    }
  }

  // Append query parameters if any exist
  if (searchParams.toString()) {
    endpoint += `?${searchParams.toString()}`;
  }

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

/**
 * Get a single page by ID with optional body expansion - internal helper
 */
async function getPageInternal(
  baseUrl: string,
  accessToken: string,
  pageId: string,
  includeBody: boolean = false
): Promise<Result<ConfluencePage | null, string>> {
  const searchParams = new URLSearchParams();
  if (includeBody) {
    // Use body-format parameter for Confluence API v2 - API expects single format
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
    // Handle 404 as null result
    if (result.error.includes("404")) {
      return new Ok(null);
    }
    return new Err(result.error);
  }

  return new Ok(result.value);
}

/**
 * Update an existing page - internal helper
 */
async function updatePageInternal(
  baseUrl: string,
  accessToken: string,
  updateData: ConfluenceUpdatePageRequest
): Promise<Result<ConfluencePage, string>> {
  // First, get the current page data to preserve existing values
  const currentPageResult = await getPageInternal(
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

  // Prepare the update payload - include id in the body as required by the API
  // Use existing values as defaults to avoid null/undefined issues
  const payload: any = {
    id: updateData.id,
    version: updateData.version,
    // Always include required fields, using existing values if not provided
    status: updateData.status ?? (currentPage.status || "current"),
    title: updateData.title ?? currentPage.title,
  };

  // Optional fields - only include if provided or if they exist in current page
  if (updateData.spaceId ?? currentPage.spaceId) {
    payload.spaceId = updateData.spaceId ?? currentPage.spaceId;
  }
  if (updateData.parentId ?? currentPage.parentId) {
    payload.parentId = updateData.parentId ?? currentPage.parentId;
  }

  if (updateData.body) {
    payload.body = {
      [updateData.body.representation]: {
        value: updateData.body.value,
        representation: updateData.body.representation,
      },
    };
  }

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

/**
 * Create a new page - internal helper
 */
async function createPageInternal(
  baseUrl: string,
  accessToken: string,
  createData: ConfluenceCreatePageRequest
): Promise<Result<ConfluencePage, string>> {
  const endpoint = `/wiki/api/v2/pages`;

  // Prepare the create payload
  const payload: any = {
    spaceId: createData.spaceId,
    title: createData.title,
    status: createData.status || "current",
  };

  // Optional fields
  if (createData.parentId) {
    payload.parentId = createData.parentId;
  }

  if (createData.body) {
    payload.body = {
      [createData.body.representation]: {
        value: createData.body.value,
        representation: createData.body.representation,
      },
    };
  }

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

// Wrapper functions that return CallToolResult - following Jira MCP pattern

export async function getCurrentUser(): Promise<CallToolResult> {
  return makeMCPToolTextError(
    "getCurrentUser must be called through withAuth wrapper"
  );
}

export async function listPages(
  baseUrl: string,
  accessToken: string,
  params: ConfluenceListPagesRequest
): Promise<CallToolResult> {
  const result = await listPagesInternal(baseUrl, accessToken, params);
  if (result.isErr()) {
    return makeMCPToolTextError(`Error listing pages: ${result.error}`);
  }

  const message =
    result.value.results.length === 0
      ? "No pages found matching the criteria"
      : `Found ${result.value.results.length} page(s)`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message,
            result: result.value,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function listSpaces(
  baseUrl: string,
  accessToken: string,
  params: ConfluenceListSpacesRequest
): Promise<CallToolResult> {
  const result = await listSpacesInternal(baseUrl, accessToken, params);
  if (result.isErr()) {
    return makeMCPToolTextError(`Error listing spaces: ${result.error}`);
  }

  const message =
    result.value.results.length === 0
      ? "No spaces found matching the criteria"
      : `Found ${result.value.results.length} space(s)`;

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message,
            result: result.value,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function getPage(
  baseUrl: string,
  accessToken: string,
  pageId: string,
  includeBody: boolean = false
): Promise<CallToolResult> {
  const result = await getPageInternal(
    baseUrl,
    accessToken,
    pageId,
    includeBody
  );
  if (result.isErr()) {
    return makeMCPToolTextError(`Error getting page: ${result.error}`);
  }

  if (result.value === null) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Page not found",
              result: { found: false, pageId },
            },
            null,
            2
          ),
        },
      ],
    };
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message: "Page retrieved successfully",
            result: { page: result.value },
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function updatePage(
  baseUrl: string,
  accessToken: string,
  updateData: ConfluenceUpdatePageRequest
): Promise<CallToolResult> {
  const result = await updatePageInternal(baseUrl, accessToken, updateData);
  if (result.isErr()) {
    return makeMCPToolTextError(`Error updating page: ${result.error}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message: "Page updated successfully",
            result: result.value,
          },
          null,
          2
        ),
      },
    ],
  };
}

export async function createPage(
  baseUrl: string,
  accessToken: string,
  createData: ConfluenceCreatePageRequest
): Promise<CallToolResult> {
  const result = await createPageInternal(baseUrl, accessToken, createData);
  if (result.isErr()) {
    return makeMCPToolTextError(`Error creating page: ${result.error}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            message: "Page created successfully",
            result: result.value,
          },
          null,
          2
        ),
      },
    ],
  };
}

// Wrapper for getCurrentUser that follows the withAuth pattern
export const getCurrentUserWrapper = {
  execute: async (
    baseUrl: string,
    accessToken: string
  ): Promise<CallToolResult> => {
    const result = await getCurrentUserInternal(baseUrl, accessToken);
    if (result.isErr()) {
      return makeMCPToolTextError(
        `Error getting current user: ${result.error}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              message: "Current user information retrieved successfully",
              result: result.value,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};
