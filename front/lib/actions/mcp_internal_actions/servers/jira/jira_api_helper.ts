import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { z } from "zod";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

const SEARCH_MAX_RESULTS = 20;

// Jira entity schemas - shared field definitions
const JiraIssueFieldsSchema = z
  .object({
    project: z.object({
      key: z.string(),
    }),
    summary: z.string(),
    description: z
      .object({
        type: z.string(),
        version: z.number(),
        content: z.array(
          z.object({
            type: z.string(),
            content: z.array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
              })
            ),
          })
        ),
      })
      .nullable(),
    issuetype: z.object({
      name: z.string(),
    }),
    priority: z.object({
      name: z.string(),
    }),
    assignee: z
      .object({
        accountId: z.string(),
      })
      .nullable(),
    reporter: z
      .object({
        accountId: z.string(),
      })
      .nullable(),
    labels: z.array(z.string()).nullable(),
    parent: z
      .object({
        key: z.string(),
      })
      .nullable(),
  })
  .passthrough();

const JiraIssueSchema = z
  .object({
    id: z.string(),
    key: z.string(),
    browseUrl: z.string().optional(),
    fields: JiraIssueFieldsSchema.deepPartial().optional(),
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

const JiraCreateMetaSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
});

const JiraSearchResultSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      fields: z
        .object({
          summary: z.string(),
        })
        .passthrough(),
    })
  ),
  isLast: z.boolean().optional(),
  nextPageToken: z.string().optional(),
});

const JiraUserInfoSchema = z
  .object({
    accountId: z.string(),
    emailAddress: z.string(),
    displayName: z.string(),
    accountType: z.string(),
    locale: z.string().optional(),
  })
  .passthrough();

const JiraConnectionInfoSchema = z.object({
  user: z.object({
    account_id: z.string(),
    name: z.string(),
    nickname: z.string(),
  }),
  instance: z.object({
    cloud_id: z.string(),
    site_url: z.string(),
    site_name: z.string(),
    api_base_url: z.string(),
  }),
});

const JiraTransitionIssueSchema = z.void();

export const JiraCreateIssueRequestSchema = JiraIssueFieldsSchema.partial({
  description: true,
  priority: true,
  assignee: true,
  reporter: true,
  labels: true,
  parent: true,
});

const JiraIssueTypeSchema = z.unknown();
type JiraIssueType = z.infer<typeof JiraIssueTypeSchema>;

type JiraSearchResult = z.infer<typeof JiraSearchResultSchema>;

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

    // Handle empty responses for successful status codes (like 204 No Content)
    if (!responseText && response.status >= 200 && response.status < 300) {
      const parseResult = schema.safeParse(undefined);
      if (parseResult.success) {
        return new Ok(parseResult.data);
      }
      // If void parsing fails but it's a successful status, return success anyway
      return new Ok(undefined as any);
    }

    if (!responseText) {
      return new Err("Empty response from JIRA API");
    }

    const rawData = JSON.parse(responseText);
    logger.info(`[JIRA MCP Server] Raw response for ${endpoint}: ${JSON.stringify(rawData)}`);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid JIRA response format: ${parseResult.error.message}`;
      logger.error(
        `[JIRA MCP Server] ${msg}, rawData: ${JSON.stringify(rawData)}`
      );
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
): Promise<Result<z.infer<typeof JiraProjectSchema> | null, JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/project/${projectKey}`,
      accessToken,
    },
    JiraProjectSchema,
    { baseUrl }
  );
  if (result.isErr()) {
    // Handle 404 as "not found" rather than an error
    if (result.error.includes("404")) {
      return new Ok(null);
    }
    return result;
  }
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

export async function searchIssues(
  baseUrl: string,
  accessToken: string,
  jql: string = "*",
  nextPageToken?: string,
  maxResults: number = SEARCH_MAX_RESULTS
): Promise<Result<JiraSearchResult, JiraErrorResult>> {
  const requestBody: any = {
    jql,
    maxResults,
    fields: ["summary"]
  };
  
  if (nextPageToken) {
    requestBody.nextPageToken = nextPageToken;
  }

  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/search/jql`,
      accessToken,
    },
    JiraSearchResultSchema,
    { 
      baseUrl,
      method: "POST",
      body: requestBody
    }
  );

  if (result.isErr()) {
    return result;
  }

  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo && result.value.issues) {
    result.value.issues = result.value.issues.map((issue) => ({
      ...issue,
      browseUrl: `${resourceInfo.url}/browse/${issue.key}`,
    }));
  }

  return result;
}

export async function getIssueTypes(
  baseUrl: string,
  accessToken: string,
  projectKey: string
): Promise<Result<JiraIssueType[], JiraErrorResult>> {
  const IssueTypesResponseSchema = z.object({
    issueTypes: z.array(JiraIssueTypeSchema),
    maxResults: z.number().optional(),
    startAt: z.number().optional(),
    total: z.number().optional(),
  });

  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
      accessToken,
    },
    IssueTypesResponseSchema,
    { baseUrl }
  );

  if ("error" in result) {
    return result;
  }

  return new Ok(result.value.issueTypes);
}

export async function getIssueFields(
  baseUrl: string,
  accessToken: string,
  projectKey: string,
  issueTypeId: string
): Promise<Result<z.infer<typeof JiraCreateMetaSchema>, JiraErrorResult>> {
  const LenientSchema = z.any();
  const endpoint = `/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`;
  return jiraApiCall(
    {
      endpoint,
      accessToken,
    },
    LenientSchema,
    { baseUrl }
  );
}

async function getUserInfo(
  baseUrl: string,
  accessToken: string
): Promise<Result<z.infer<typeof JiraUserInfoSchema>, JiraErrorResult>> {
  return jiraApiCall(
    {
      endpoint: "/rest/api/3/myself",
      accessToken,
    },
    JiraUserInfoSchema,
    { baseUrl }
  );
}

export async function getConnectionInfo(
  accessToken: string
): Promise<Result<z.infer<typeof JiraConnectionInfoSchema>, JiraErrorResult>> {
  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (!resourceInfo) {
    return new Err("Failed to retrieve JIRA resource information");
  }

  const baseUrl = `https://api.atlassian.com/ex/jira/${resourceInfo.id}`;
  const userResult = await getUserInfo(baseUrl, accessToken);
  if (userResult.isErr()) {
    return userResult;
  }

  const connectionInfo = {
    user: {
      account_id: userResult.value.accountId,
      name: userResult.value.displayName,
      nickname: userResult.value.displayName,
    },
    instance: {
      cloud_id: resourceInfo.id,
      site_url: resourceInfo.url,
      site_name: resourceInfo.name,
      api_base_url: baseUrl,
    },
  };
  return new Ok(connectionInfo);
}

export async function transitionIssue(
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  transitionId: string,
  comment?: string
): Promise<Result<z.infer<typeof JiraTransitionIssueSchema>, JiraErrorResult>> {
  const requestBody: any = {
    transition: { id: transitionId },
  };

  if (comment) {
    requestBody.update = {
      comment: [{ add: { body: comment } }],
    };
  }

  return jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}/transitions`,
      accessToken,
    },
    JiraTransitionIssueSchema,
    {
      method: "POST",
      body: requestBody,
      baseUrl,
    }
  );
}

export async function createIssue(
  baseUrl: string,
  accessToken: string,
  issueData: z.infer<typeof JiraCreateIssueRequestSchema>
): Promise<Result<z.infer<typeof JiraIssueSchema>, JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: "/rest/api/3/issue",
      accessToken,
    },
    JiraIssueSchema,
    {
      method: "POST",
      body: { fields: issueData },
      baseUrl,
    }
  );

  if (result.isErr()) {
    return result;
  }

  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo && result.value) {
    result.value.browseUrl = `${resourceInfo.url}/browse/${result.value.key}`;
  }

  return result;
}

export async function updateIssue(
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  updateData: Partial<z.infer<typeof JiraCreateIssueRequestSchema>>
): Promise<Result<{ issueKey: string; browseUrl?: string } | null, JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}`,
      accessToken,
    },
    z.void(),
    {
      method: "PUT",
      body: { fields: updateData },
      baseUrl,
    }
  );

  if (result.isErr()) {
    // Handle 404 as "not found" rather than an error
    if (result.error.includes("404")) {
      return new Ok(null);
    }
    return result;
  }

  const responseData = { issueKey };

  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo) {
    return new Ok({
      ...responseData,
      browseUrl: `${resourceInfo.url}/browse/${issueKey}`,
    });
  }

  return new Ok(responseData);
}
