import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { z } from "zod";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

// Confluence entity schemas
const ConfluencePageSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    browseUrl: z.string().optional(),
  })
  .passthrough();

const ConfluenceResourceSchema = z.array(
  z.object({
    id: z.string(),
    url: z.string(),
    name: z.string(),
  })
);

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
      return new Err("Empty response from Confluence API");
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid Confluence response format: ${parseResult.error.message}`;
      logger.error(`[Confluence MCP Server] ${msg}`);
      return new Err(msg);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    logger.error(
      `[Confluence MCP Server] Confluence API call failed for ${endpoint}:`
    );
    return new Err(normalizeError(error).message);
  }
}

export async function getPage({
  baseUrl,
  accessToken,
  pageId,
}: {
  baseUrl: string;
  accessToken: string;
  pageId: string;
}): Promise<
  Result<z.infer<typeof ConfluencePageSchema> | null, ConfluenceErrorResult>
> {
  const result = await confluenceApiCall(
    {
      endpoint: `/wiki/api/v2/pages/${pageId}`,
      accessToken,
    },
    ConfluencePageSchema,
    { baseUrl }
  );
  if (result.isErr()) {
    // Handle 404 as "not found" rather than an error
    if (result.error.includes("404")) {
      return new Ok(null);
    }
    return result;
  }
  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  if (resourceInfo) {
    result.value = {
      ...result.value,
      browseUrl: `${resourceInfo.url}/wiki/spaces/viewpage.action?pageId=${result.value.id}`,
    };
  }
  return new Ok(result.value);
}

// Confluence resource and URL utilities
async function getConfluenceResourceInfo(accessToken: string): Promise<{
  id: string;
  url: string;
  name: string;
} | null> {
  const result = await confluenceApiCall(
    {
      endpoint: "/oauth/token/accessible-resources",
      accessToken,
    },
    ConfluenceResourceSchema,
    {
      baseUrl: "https://api.atlassian.com",
    }
  );

  if (result.isErr()) {
    return null;
  }

  const resources = result.value;
  if (resources && resources.length > 0) {
    const resource = resources[0];
    return {
      id: resource.id,
      url: resource.url,
      name: resource.name,
    };
  }

  return null;
}

export async function createPage({
  baseUrl,
  accessToken,
  spaceId,
  title,
  content,
  parentId,
}: {
  baseUrl: string;
  accessToken: string;
  spaceId: string;
  title: string;
  content: string;
  parentId?: string;
}): Promise<
  Result<z.infer<typeof ConfluencePageSchema>, ConfluenceErrorResult>
> {
  const body = {
    spaceId,
    status: "current",
    title,
    body: {
      representation: "storage",
      value: content,
    },
    ...(parentId && { parentId }),
  };

  const result = await confluenceApiCall(
    {
      endpoint: "/wiki/api/v2/pages",
      accessToken,
    },
    ConfluencePageSchema,
    {
      baseUrl,
      method: "POST",
      body,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  if (resourceInfo) {
    result.value = {
      ...result.value,
      browseUrl: `${resourceInfo.url}/wiki/spaces/viewpage.action?pageId=${result.value.id}`,
    };
  }

  return result;
}

export async function updatePageContent({
  baseUrl,
  accessToken,
  pageId,
  title,
  content,
  version,
}: {
  baseUrl: string;
  accessToken: string;
  pageId: string;
  title: string;
  content: string;
  version: number;
}): Promise<
  Result<z.infer<typeof ConfluencePageSchema>, ConfluenceErrorResult>
> {
  const body = {
    type: "page",
    title,
    version: { number: version },
    body: {
      storage: {
        value: content,
        representation: "storage",
      },
    },
  };

  // Use v1 API for content updates as v2 has limited functionality
  const result = await confluenceApiCall(
    {
      endpoint: `/wiki/rest/api/content/${pageId}`,
      accessToken,
    },
    ConfluencePageSchema,
    {
      baseUrl,
      method: "PUT",
      body,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  if (resourceInfo) {
    result.value = {
      ...result.value,
      browseUrl: `${resourceInfo.url}/wiki/spaces/viewpage.action?pageId=${result.value.id}`,
    };
  }

  return result;
}

export async function getConfluenceBaseUrl(
  accessToken: string
): Promise<string | null> {
  const resourceInfo = await getConfluenceResourceInfo(accessToken);
  const cloudId = resourceInfo?.id ?? null;
  if (cloudId) {
    return `https://api.atlassian.com/ex/confluence/${cloudId}`;
  }
  return null;
}
