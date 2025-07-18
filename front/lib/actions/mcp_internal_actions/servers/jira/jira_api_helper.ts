import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { z } from "zod";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

// Jira entity schemas
const JiraIssueSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    browseUrl: z.string().optional(),
  })
  .passthrough();

const JiraResourceSchema = z.array(
  z.object({
    id: z.string(),
    url: z.string(),
    name: z.string(),
  })
);

type JiraIssue = z.infer<typeof JiraIssueSchema>;
type JiraErrorResult = { error: string };
type GetIssueResult = JiraIssue | null;

// Generic wrapper for JIRA API calls with validation
async function jiraApiCall<T>(
  {
    endpoint,
    accessToken,
  }: {
    endpoint: string;
    accessToken: string;
  },
  schema: z.ZodSchema<T>,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    baseUrl: string;
  }
): Promise<Result<T, JiraErrorResult>> {
  try {
    const response = await fetch(`${options.baseUrl}${endpoint}`, {
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
      const msg = `[JIRA MCP Server] JIRA API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(msg);
      return new Err({ error: msg });
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err({
        error: "[JIRA MCP Server] Empty response from JIRA API",
      });
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `[JIRA MCP Server] Invalid JIRA response format: ${parseResult.error.message}`;
      logger.error(msg, { rawData });
      return new Err({ error: msg });
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    logger.error(
      `[JIRA MCP Server] JIRA API call failed for ${endpoint}:`,
      error
    );
    return new Err({ error: normalizeError(error).message });
  }
}

export const getIssue = async ({
  baseUrl,
  accessToken,
  issueKey,
}: {
  baseUrl: string;
  accessToken: string;
  issueKey: string;
}): Promise<Result<GetIssueResult, JiraErrorResult>> => {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}`,
      accessToken,
    },
    JiraIssueSchema,
    { baseUrl }
  );
  if (result.isErr()) {
    // Handle 404 as "not found" rather than an error
    if (result.error.error.includes("404")) {
      return new Ok(null);
    }
    return result;
  }
  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo) {
    result.value = {
      ...result.value,
      browseUrl: `${resourceInfo.url}/browse/${result.value.key}`,
    };
  }
  return new Ok(result.value);
};

// Jira resource and URL utilities
async function getJiraResourceInfo(accessToken: string): Promise<{
  id: string;
  url: string;
  name: string;
} | null> {
  const result = await jiraApiCall(
    {
      endpoint: "/oauth/token/accessible-resources",
      accessToken,
    },
    JiraResourceSchema,
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

async function getJiraCloudId(accessToken: string): Promise<string | null> {
  const resourceInfo = await getJiraResourceInfo(accessToken);
  return resourceInfo?.id || null;
}

export async function getJiraBaseUrl(
  accessToken: string
): Promise<string | null> {
  const cloudId = await getJiraCloudId(accessToken);
  if (cloudId) {
    return `https://api.atlassian.com/ex/jira/${cloudId}`;
  }
  return null;
}
