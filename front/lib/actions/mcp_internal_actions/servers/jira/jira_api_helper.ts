import { z } from "zod";

import logger from "@app/logger/logger";

const MAX_LIMIT = 50;

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

    // Handle empty responses (like 204 No Content)
    const responseText = await response.text();
    if (!responseText) {
      // For void responses, return undefined if schema expects void
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
  } catch (error: any) {
    logger.error(`JIRA API call failed for ${endpoint}:`, error);
    return { error: error?.message || "Unknown JIRA API error" };
  }
}

// Zod schemas for JIRA API responses
const JiraIssueSchema = z.object({
  id: z.string(),
  key: z.string(),
  self: z.string(),
  fields: z.object({
    summary: z.string(),
    description: z
      .union([z.string(), z.object({}).passthrough()])
      .nullable()
      .optional(),
    status: z.object({
      name: z.string(),
      statusCategory: z.object({
        name: z.string(),
      }),
    }),
    priority: z
      .object({
        name: z.string(),
      })
      .nullable()
      .optional(),
    assignee: z
      .object({
        displayName: z.string(),
        emailAddress: z.string(),
      })
      .nullable()
      .optional(),
    reporter: z
      .object({
        displayName: z.string(),
        emailAddress: z.string(),
      })
      .nullable()
      .optional(),
    created: z.string(),
    updated: z.string(),
    issuetype: z.object({
      name: z.string(),
    }),
    project: z.object({
      key: z.string(),
      name: z.string(),
    }),
  }),
});

const JiraSearchResultSchema = z.object({
  issues: z.array(JiraIssueSchema),
  total: z.number(),
  startAt: z.number(),
  maxResults: z.number(),
});

const JiraProjectSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
});

const JiraCommentSchema = z.object({
  id: z.string(),
  body: z.union([
    z.string(),
    z.object({
      type: z.string(),
      version: z.number(),
      content: z.array(z.any()),
    }),
  ]),
  author: z.object({
    displayName: z.string(),
    emailAddress: z.string(),
  }),
  created: z.string(),
  updated: z.string(),
});

const JiraTransitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  to: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

const JiraTransitionsResponseSchema = z.object({
  transitions: z.array(JiraTransitionSchema),
});

const JiraCreateIssueResponseSchema = z.object({
  id: z.string(),
  key: z.string(),
  self: z.string(),
});

const JiraIssueTypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  avatarId: z.number().optional(),
  subtask: z.boolean(),
  hierarchyLevel: z.number().optional(),
});

const JiraFieldSchema = z.object({
  fieldId: z.string().optional(),
  name: z.string(),
  required: z.boolean(),
  schema: z
    .object({
      type: z.string(),
      system: z.string().optional(),
      custom: z.string().optional(),
      customId: z.number().optional(),
    })
    .optional(),
  operations: z.array(z.string()).optional(),
  allowedValues: z.array(z.any()).optional(),
  defaultValue: z.any().optional(),
  key: z.string().optional(),
  hasDefaultValue: z.boolean().optional(),
  autoCompleteUrl: z.string().optional(),
});

const JiraIssueTypeWithFieldsSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  iconUrl: z.string().optional(),
  avatarId: z.number().optional(),
  subtask: z.boolean(),
  hierarchyLevel: z.number().optional(),
  fields: z.record(z.string(), JiraFieldSchema).optional(),
});

const JiraProjectMetaSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  issuetypes: z.array(JiraIssueTypeWithFieldsSchema),
});

const JiraCreateMetaSchema = z.object({
  projects: z.array(JiraProjectMetaSchema),
  expand: z.string().optional(),
});

const JiraUserInfoSchema = z.object({
  accountId: z.string(),
  emailAddress: z.string(),
  displayName: z.string(),
  avatarUrls: z.object({
    "48x48": z.string(),
  }),
  accountType: z.string(),
  active: z.boolean(),
  timeZone: z.string().optional(),
  locale: z.string().optional(),
  groups: z
    .object({
      size: z.number(),
      items: z.array(z.any()),
    })
    .optional(),
  applicationRoles: z
    .object({
      size: z.number(),
      items: z.array(z.any()),
    })
    .optional(),
  expand: z.string().optional(),
});

// Extract TypeScript types from schemas
type JiraIssue = z.infer<typeof JiraIssueSchema>;
type JiraSearchResult = z.infer<typeof JiraSearchResultSchema>;
type JiraComment = z.infer<typeof JiraCommentSchema>;
type JiraTransitionsResponse = z.infer<typeof JiraTransitionsResponseSchema>;
type JiraProject = z.infer<typeof JiraProjectSchema>;
type JiraCreateIssueResponse = z.infer<typeof JiraCreateIssueResponseSchema>;
type JiraIssueType = z.infer<typeof JiraIssueTypeSchema>;
type JiraCreateMeta = z.infer<typeof JiraCreateMetaSchema>;
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

  // Handle 404 case specifically
  if ("error" in result && result.error.includes("404")) {
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
  return jiraApiCall(
    `/rest/api/3/search?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`,
    accessToken,
    JiraSearchResultSchema,
    { baseUrl }
  );
};

// Helper function to convert plain text to Atlassian Document Format
/*const convertTextToADF = (text: string) => {
  return {
    type: "doc",
    version: 1,
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      },
    ],
  };
};*/

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
    }
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
  return jiraApiCall(
    `/rest/api/3/issue/createmeta/${projectKey}/issuetypes`,
    accessToken,
    z.array(JiraIssueTypeSchema),
    { baseUrl }
  );
};

export const getIssueFields = async (
  baseUrl: string,
  accessToken: string,
  projectKey: string,
  issueTypeId?: string
): Promise<GetIssueFieldsResult> => {
  const params = new URLSearchParams({
    projectKeys: projectKey,
    expand: "projects.issuetypes.fields",
  });
  if (issueTypeId) {
    params.append("issuetypeIds", issueTypeId);
  }

  // Use a more lenient schema to capture the actual response structure
  const LenientCreateMetaSchema = z
    .object({
      projects: z.array(z.any()),
    })
    .passthrough();

  return jiraApiCall(
    `/rest/api/3/issue/createmeta?${params.toString()}`,
    accessToken,
    LenientCreateMetaSchema,
    { baseUrl }
  );
};

export const getUserInfo = async (
  baseUrl: string,
  accessToken: string
): Promise<GetUserInfoResult> => {
  return jiraApiCall("/rest/api/3/myself", accessToken, JiraUserInfoSchema, {
    baseUrl,
  });
};
