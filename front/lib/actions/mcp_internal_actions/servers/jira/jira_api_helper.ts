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

const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

const JiraTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const JiraTransitionsSchema = z.object({
  transitions: z.array(JiraTransitionSchema),
});

const JiraCommentSchema = z.object({
  id: z.string(),
  body: z.object({
    type: z.string(),
    version: z.number(),
  }),
});

type JiraErrorResult = string;
// Generic wrapper for JIRA API calls with validation
async function jiraApiCall<T extends z.ZodTypeAny>(
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
): Promise<Result<z.infer<T>, JiraErrorResult>> {
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
      const msg = `JIRA API error: ${response.status} ${response.statusText} - ${errorBody}`;
      logger.error(`[JIRA MCP Server] ${msg}`);
      return new Err(msg);
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err("Empty response from JIRA API");
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid JIRA response format: ${parseResult.error.message}`;
      logger.error(`[JIRA MCP Server] ${msg}`);
      return new Err(msg);
    }

    return new Ok(parseResult.data);
  } catch (error: unknown) {
    logger.error(`[JIRA MCP Server] JIRA API call failed for ${endpoint}:`);
    return new Err(normalizeError(error).message);
  }
}

export async function getIssue({
  baseUrl,
  accessToken,
  issueKey,
}: {
  baseUrl: string;
  accessToken: string;
  issueKey: string;
}): Promise<Result<z.infer<typeof JiraIssueSchema> | null, JiraErrorResult>> {
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
    if (result.error.includes("404")) {
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
}

export async function getProjects(
  baseUrl: string,
  accessToken: string
): Promise<
  Result<z.infer<typeof JiraProjectSchema>[] | null, JiraErrorResult>
> {
  const result = await jiraApiCall(
    {
      endpoint: "/rest/api/3/project",
      accessToken,
    },
    z.array(JiraProjectSchema),
    { baseUrl }
  );
  return result;
}

export async function getProject(
  baseUrl: string,
  accessToken: string,
  projectKey: string
): Promise<Result<z.infer<typeof JiraProjectSchema>[], JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/project/${projectKey}`,
      accessToken,
    },
    z.array(JiraProjectSchema),
    { baseUrl }
  );
  return result;
}

export async function getTransitions(
  baseUrl: string,
  accessToken: string,
  issueKey: string
): Promise<
  Result<z.infer<typeof JiraTransitionsSchema> | null, JiraErrorResult>
> {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}/transitions`,
      accessToken,
    },
    JiraTransitionsSchema,
    { baseUrl }
  );
  return result;
}

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

export async function getJiraBaseUrl(
  accessToken: string
): Promise<string | null> {
  const resourceInfo = await getJiraResourceInfo(accessToken);
  const cloudId = resourceInfo?.id || null;
  if (cloudId) {
    return `https://api.atlassian.com/ex/jira/${cloudId}`;
  }
  return null;
}

export async function createComment(
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  commentBody: string,
  visibility?: {
    type: "group" | "role";
    value: string;
  }
): Promise<Result<z.infer<typeof JiraCommentSchema>, JiraErrorResult>> {
  const requestBody: any = {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: commentBody,
            },
          ],
        },
      ],
    },
  };
  if (visibility) {
    requestBody.visibility = visibility;
  }
  return jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}/comment`,
      accessToken,
    },
    JiraCommentSchema,
    {
      method: "POST",
      body: requestBody,
      baseUrl,
    }
  );
}
