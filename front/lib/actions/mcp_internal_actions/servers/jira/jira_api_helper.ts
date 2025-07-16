import { z } from "zod";

import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

import { getJiraResourceInfo } from "./jira_utils";
const MAX_LIMIT = 20;

// Generic wrapper for JIRA API calls with validation
async function jiraApiCall<T>(
  endpoint: string,
  accessToken: string,
  schema: z.ZodSchema<T>,
  options: {
    method?: "GET" | "POST" | "PUT" | "DELETE";
    body?: any;
    baseUrl: string;
  }
): Promise<T | { error: string }> {
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
      logger.error(msg);
      return { error: msg };
    }

    const responseText = await response.text();
    if (!responseText) {
      const parseResult = schema.safeParse(undefined);
      if (parseResult.success) {
        return parseResult.data;
      }
      return { error: "Empty response from JIRA API" };
    }

    const rawData = JSON.parse(responseText);
    const parseResult = schema.safeParse(rawData);

    if (!parseResult.success) {
      const msg = `Invalid JIRA response format: ${parseResult.error.message}`;
      logger.error(msg, { rawData });
      return { error: msg };
    }

    return parseResult.data;
  } catch (error: unknown) {
    logger.error(`JIRA API call failed for ${endpoint}:`, error);
    return { error: normalizeError(error).message };
  }
}

const JiraIssueSchema = z
  .object({
    //id: z.string(),
    code: z.string().optional(),
  })
  .passthrough();
type JiraIssue = z.infer<typeof JiraIssueSchema>;

const JiraSearchResultSchema = z.object({
  issues: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      self: z.string(),
      fields: z
        .object({
          summary: z.string(),
        })
        .passthrough(),
    })
  ),
  isLast: z.boolean(),
});
type JiraSearchResult = z.infer<typeof JiraSearchResultSchema>;

const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});
type JiraProject = z.infer<typeof JiraProjectSchema>;

const JiraCommentSchema = z.object({
  id: z.string(),
  body: z.object({
    type: z.string(),
    version: z.number(),
  }),
});
type JiraComment = z.infer<typeof JiraCommentSchema>;

const JiraTransitionsResponseSchema = z.object({
  transitions: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
});
type JiraTransitionsResponse = z.infer<typeof JiraTransitionsResponseSchema>;

const JiraCreateIssueResponseSchema = z
  .object({
    id: z.string(),
    key: z.string(),
  })
  .passthrough();
type JiraCreateIssueResponse = z.infer<typeof JiraCreateIssueResponseSchema>;

type JiraIssueType = z.infer<typeof JiraIssueTypeSchema>;
const JiraIssueTypeSchema = z.unknown();

const JiraCreateMetaSchema = z.object({
  fields: z.record(z.string(), z.unknown()),
});
type JiraCreateMeta = z.infer<typeof JiraCreateMetaSchema>;

const JiraUserInfoSchema = z
  .object({
    accountId: z.string(),
    emailAddress: z.string(),
    displayName: z.string(),
    accountType: z.string(),
    locale: z.string().optional(),
  })
  .passthrough();
type JiraUserInfo = z.infer<typeof JiraUserInfoSchema>;

type JiraErrorResult = { error: string };
type GetIssueResult = JiraIssue | null | JiraErrorResult;
type SearchIssuesResult = JiraSearchResult | JiraErrorResult;
type CreateIssueResult = JiraCreateIssueResponse | JiraErrorResult;
type UpdateIssueResult = void | JiraErrorResult;
type AddCommentResult = JiraComment | JiraErrorResult;
type GetTransitionsResult = JiraTransitionsResponse | JiraErrorResult;
type TransitionIssueResult = void | JiraErrorResult;
type GetProjectsResult = JiraProject[] | JiraErrorResult;
type GetProjectResult = JiraProject | JiraErrorResult;
type GetIssueTypesResult = JiraIssueType[] | JiraErrorResult;
type GetIssueFieldsResult = JiraCreateMeta | JiraErrorResult;
type GetUserInfoResult = JiraUserInfo | JiraErrorResult;

export const getIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string
): Promise<GetIssueResult> => {
  const result = await jiraApiCall(
    `/rest/api/3/issue/${issueKey}`,
    accessToken,
    JiraIssueSchema,
    { baseUrl }
  );
  if (
    "error" in result &&
    typeof result.error === "string" &&
    result.error.includes("404")
  ) {
    return null;
  }

  return result;
};

export const searchIssues = async (
  baseUrl: string,
  accessToken: string,
  jql: string = "*",
  startAt: number = 0,
  maxResults: number = MAX_LIMIT
): Promise<SearchIssuesResult> => {
  const result = await jiraApiCall(
    `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&fields=summary`,
    accessToken,
    JiraSearchResultSchema,
    { baseUrl }
  );

  if ("error" in result) {
    return result;
  }

  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo && result.issues) {
    result.issues = result.issues.map((issue) => ({
      ...issue,
      browseUrl: `${resourceInfo.url}/browse/${issue.key}`,
    }));
  }

  return result;
};
export interface CreateIssueRequest {
  project: {
    key: string;
  };
  summary: string;
  description?: {
    type: string;
    version: number;
    content: Array<{
      type: string;
      content?: Array<{
        type: string;
        text?: string;
      }>;
    }>;
  };
  issuetype: {
    name: string;
  };
  priority?: {
    name: string;
  };
  assignee?: {
    accountId: string;
  };
  labels?: string[];
  parent?: {
    key: string;
  };
}

export const createIssue = async (
  baseUrl: string,
  accessToken: string,
  issueData: CreateIssueRequest
): Promise<CreateIssueResult> => {
  return jiraApiCall(
    "/rest/api/3/issue",
    accessToken,
    JiraCreateIssueResponseSchema,
    {
      method: "POST",
      body: { fields: issueData },
      baseUrl,
    }
  );
};

export const updateIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  updateData: Partial<CreateIssueRequest>
): Promise<UpdateIssueResult> => {
  const result = await jiraApiCall(
    `/rest/api/3/issue/${issueKey}`,
    accessToken,
    z.void(),
    {
      method: "PUT",
      body: { fields: updateData },
      baseUrl,
    }
  );

  return result;
};

export const addComment = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  commentBody: string,
  visibility?: {
    type: "group" | "role";
    value: string;
  }
): Promise<AddCommentResult> => {
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
    `/rest/api/3/issue/${issueKey}/comment`,
    accessToken,
    JiraCommentSchema,
    {
      method: "POST",
      body: requestBody,
      baseUrl,
    }
  );
};

export const getTransitions = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string
): Promise<GetTransitionsResult> => {
  return jiraApiCall(
    `/rest/api/3/issue/${issueKey}/transitions`,
    accessToken,
    JiraTransitionsResponseSchema,
    { baseUrl }
  );
};

export const getProjects = async (
  baseUrl: string,
  accessToken: string
): Promise<GetProjectsResult> => {
  return jiraApiCall(
    "/rest/api/3/project",
    accessToken,
    z.array(JiraProjectSchema),
    {
      baseUrl,
    }
  );
};

export const getProject = async (
  baseUrl: string,
  accessToken: string,
  projectKey: string
): Promise<GetProjectResult> => {
  return jiraApiCall(
    `/rest/api/3/project/${projectKey}`,
    accessToken,
    JiraProjectSchema,
    { baseUrl }
  );
};

export const transitionIssue = async (
  baseUrl: string,
  accessToken: string,
  issueKey: string,
  transitionId: string,
  comment?: string
): Promise<TransitionIssueResult> => {
  const requestBody: any = {
    transition: { id: transitionId },
  };

  if (comment) {
    requestBody.update = {
      comment: [{ add: { body: comment } }],
    };
  }

  return jiraApiCall(
    `/rest/api/3/issue/${issueKey}/transitions`,
    accessToken,
    z.void(),
    {
      method: "POST",
      body: requestBody,
      baseUrl,
    }
  );
};

export const getIssueTypes = async (
  baseUrl: string,
  accessToken: string,
  projectKey: string
): Promise<GetIssueTypesResult> => {
  const IssueTypesResponseSchema = z.object({
    issueTypes: z.array(JiraIssueTypeSchema),
    maxResults: z.number().optional(),
    startAt: z.number().optional(),
    total: z.number().optional(),
  });

  const result = await jiraApiCall(
    `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    accessToken,
    IssueTypesResponseSchema,
    { baseUrl }
  );

  if ("error" in result) {
    return result;
  }

  return result.issueTypes;
};

export const getIssueFields = async (
  baseUrl: string,
  accessToken: string,
  projectKey: string,
  issueTypeId?: string
): Promise<GetIssueFieldsResult> => {
  const LenientSchema = z.any();
  const endpoint = `/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`;
  return jiraApiCall(endpoint, accessToken, LenientSchema, { baseUrl });
};

export const getUserInfo = async (
  baseUrl: string,
  accessToken: string
): Promise<GetUserInfoResult> => {
  return jiraApiCall("/rest/api/3/myself", accessToken, JiraUserInfoSchema, {
    baseUrl,
  });
};
