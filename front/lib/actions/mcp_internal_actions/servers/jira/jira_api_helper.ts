import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  createJQLFromSearchFilters,
  textToADF,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_utils";
import type {
  ADFDocument,
  JiraConnectionInfoSchema,
  JiraCreateCommentRequestSchema,
  JiraCreateIssueLinkRequestSchema,
  JiraCreateIssueRequestSchema,
  JiraErrorResult,
  JiraSearchRequestSchema,
  JiraSearchResult,
  JiraTransitionRequestSchema,
  SearchFilter,
  SearchFilterField,
  SortDirection,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import {
  ADFDocumentSchema,
  JiraCommentSchema,
  JiraCreateMetaSchema,
  JiraIssueLinkTypeSchema,
  JiraIssueSchema,
  JiraIssueTypeSchema,
  JiraProjectSchema,
  JiraResourceSchema,
  JiraSearchResultSchema,
  JiraTransitionIssueSchema,
  JiraTransitionsSchema,
  JiraUserInfoSchema,
  JiraUsersSearchResultSchema,
  SEARCH_FILTER_FIELDS,
  SEARCH_ISSUES_MAX_RESULTS,
  SEARCH_USERS_MAX_RESULTS,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import { makeMCPToolTextError } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types";

// Type guard to check if a value is an ADFDocument
function isADFDocument(value: unknown): value is ADFDocument {
  return ADFDocumentSchema.safeParse(value).success;
}

// Generic helper to handle errors consistently
function handleResults<T>(
  result: Result<T, JiraErrorResult>,
  defaultValue: T
): Result<T, JiraErrorResult> {
  if (result.isErr() && result.error.includes("404")) {
    return new Ok(defaultValue);
  }
  return result;
}

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
      return new Ok(undefined);
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

  const handledResult = handleResults(result, null);
  if (handledResult.isErr()) {
    return handledResult;
  }
  if (handledResult.value === null) {
    return new Ok(null);
  }

  const resourceInfo = await getJiraResourceInfo(accessToken);
  if (resourceInfo) {
    handledResult.value = {
      ...handledResult.value,
      browseUrl: `${resourceInfo.url}/browse/${handledResult.value.key}`,
    };
  }
  return new Ok(handledResult.value);
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

  return handleResults(result, []);
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

  return handleResults(result, null);
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

  return handleResults(result, null);
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
  commentBody: string | ADFDocument,
  visibility?: {
    type: "group" | "role";
    value: string;
  }
): Promise<Result<z.infer<typeof JiraCommentSchema> | null, JiraErrorResult>> {
  let adfBody: ADFDocument;

  if (typeof commentBody === "string") {
    adfBody = textToADF(commentBody);
  } else if (isADFDocument(commentBody)) {
    adfBody = commentBody;
  } else {
    return new Err(
      "Invalid comment body: must be a string or valid ADF document"
    );
  }

  const requestBody: z.infer<typeof JiraCreateCommentRequestSchema> = {
    body: {
      type: adfBody.type,
      version: adfBody.version,
      content: adfBody.content || [],
    },
  };
  if (visibility) {
    requestBody.visibility = visibility;
  }

  const result = await jiraApiCall(
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

  return handleResults(result, null);
}

export async function searchIssues(
  baseUrl: string,
  accessToken: string,
  filters: SearchFilter[],
  options?: {
    nextPageToken?: string;
    sortBy?: { field: SearchFilterField; direction: SortDirection };
    maxResults?: number;
  }
): Promise<
  Result<
    JiraSearchResult & {
      searchCriteria: { filters: SearchFilter[]; jql: string };
    },
    JiraErrorResult
  >
> {
  // Check for unimplemented filters
  const unimplementedFilter = filters.find(
    (filter) =>
      !SEARCH_FILTER_FIELDS.includes(filter.field as SearchFilterField)
  );

  if (unimplementedFilter) {
    return new Err(
      `searching with this filter is not implemented: ${unimplementedFilter.field}`
    );
  }

  const {
    nextPageToken,
    sortBy,
    maxResults = SEARCH_ISSUES_MAX_RESULTS,
  } = options || {};

  const jql = createJQLFromSearchFilters(filters, sortBy);

  const requestBody: z.infer<typeof JiraSearchRequestSchema> = {
    jql,
    maxResults,
    fields: ["summary"],
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
      body: requestBody,
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

  return new Ok({
    searchCriteria: {
      filters,
      jql,
    },
    ...result.value,
  });
}

export async function getIssueTypes(
  baseUrl: string,
  accessToken: string,
  projectKey: string
): Promise<Result<z.infer<typeof JiraIssueTypeSchema>[], JiraErrorResult>> {
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

  const handledResult = handleResults(result, { issueTypes: [] });
  if (handledResult.isErr()) {
    return handledResult;
  }

  return new Ok(handledResult.value?.issueTypes || []);
}

export async function getIssueFields(
  baseUrl: string,
  accessToken: string,
  projectKey: string,
  issueTypeId: string
): Promise<
  Result<z.infer<typeof JiraCreateMetaSchema> | null, JiraErrorResult>
> {
  const endpoint = `/rest/api/3/issue/createmeta/${projectKey}/issuetypes/${issueTypeId}`;
  const result = await jiraApiCall(
    {
      endpoint,
      accessToken,
    },
    JiraCreateMetaSchema,
    { baseUrl }
  );

  return handleResults(result, null);
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
): Promise<
  Result<z.infer<typeof JiraTransitionIssueSchema> | null, JiraErrorResult>
> {
  const requestBody: z.infer<typeof JiraTransitionRequestSchema> = {
    transition: { id: transitionId },
  };

  if (comment) {
    requestBody.update = {
      comment: [{ add: { body: comment } }],
    };
  }

  const result = await jiraApiCall(
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

  return handleResults(result, null);
}

export async function createIssue(
  baseUrl: string,
  accessToken: string,
  issueData: z.infer<typeof JiraCreateIssueRequestSchema>
): Promise<Result<z.infer<typeof JiraIssueSchema>, JiraErrorResult>> {
  // Process fields to convert strings to ADF for textarea fields only
  const processedFields: typeof issueData & Record<string, unknown> = { ...issueData };

  // Convert description from string to ADF if it's a string
  if (processedFields.description && typeof processedFields.description === "string") {
    processedFields.description = textToADF(processedFields.description);
  }

  // Convert custom fields from string to ADF if they're strings
  for (const [fieldKey, fieldValue] of Object.entries(processedFields)) {
    if (fieldKey.startsWith("customfield_") && typeof fieldValue === "string") {
      processedFields[fieldKey] = textToADF(fieldValue);
    }
  }

  const result = await jiraApiCall(
    {
      endpoint: "/rest/api/3/issue",
      accessToken,
    },
    JiraIssueSchema,
    {
      method: "POST",
      body: { fields: processedFields },
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
): Promise<
  Result<{ issueKey: string; browseUrl?: string } | null, JiraErrorResult>
> {
  // Process fields to convert strings to ADF for textarea fields only
  const processedFields: typeof updateData & Record<string, unknown> = { ...updateData };

  // Convert description from string to ADF if it's a string
  if (processedFields.description && typeof processedFields.description === "string") {
    processedFields.description = textToADF(processedFields.description);
  }

  // Convert custom fields from string to ADF if they're strings
  for (const [fieldKey, fieldValue] of Object.entries(processedFields)) {
    if (fieldKey.startsWith("customfield_") && typeof fieldValue === "string") {
      processedFields[fieldKey] = textToADF(fieldValue);
    }
  }

  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issue/${issueKey}`,
      accessToken,
    },
    z.void(),
    {
      method: "PUT",
      body: { fields: processedFields },
      baseUrl,
    }
  );

  const handledResult = handleResults(result, undefined);
  if (handledResult.isErr()) {
    return handledResult;
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

type WithAuthParams = {
  authInfo?: AuthInfo;
  action: (baseUrl: string, accessToken: string) => Promise<CallToolResult>;
};

export async function createIssueLink(
  baseUrl: string,
  accessToken: string,
  linkData: z.infer<typeof JiraCreateIssueLinkRequestSchema>
): Promise<Result<void, JiraErrorResult>> {
  const requestBody: Record<string, any> = { ...linkData };

  // If there's a comment, transform it to JIRA document format using ADF helper
  if (
    requestBody.comment?.body &&
    typeof requestBody.comment.body === "string"
  ) {
    const commentText = requestBody.comment.body;
    requestBody.comment = {
      ...requestBody.comment,
      body: textToADF(commentText),
    };
  }

  const result = await jiraApiCall(
    {
      endpoint: "/rest/api/3/issueLink",
      accessToken,
    },
    z.void(),
    {
      method: "POST",
      body: requestBody,
      baseUrl,
    }
  );

  return handleResults(result, undefined);
}

export async function deleteIssueLink(
  baseUrl: string,
  accessToken: string,
  linkId: string
): Promise<Result<void, JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/issueLink/${linkId}`,
      accessToken,
    },
    z.void(),
    {
      method: "DELETE",
      baseUrl,
    }
  );

  return result;
}

export async function getIssueLinkTypes(
  baseUrl: string,
  accessToken: string
): Promise<Result<z.infer<typeof JiraIssueLinkTypeSchema>[], JiraErrorResult>> {
  const result = await jiraApiCall(
    {
      endpoint: "/rest/api/3/issueLinkType",
      accessToken,
    },
    z.object({
      issueLinkTypes: z.array(JiraIssueLinkTypeSchema),
    }),
    { baseUrl }
  );

  if (result.isErr()) {
    return result;
  }

  return new Ok(result.value.issueLinkTypes);
}

export async function searchUsers(
  baseUrl: string,
  accessToken: string,
  query: string,
  maxResults: number = SEARCH_USERS_MAX_RESULTS
): Promise<
  Result<z.infer<typeof JiraUsersSearchResultSchema>, JiraErrorResult>
> {
  const params = new URLSearchParams({
    query,
    maxResults: maxResults.toString(),
  });

  const result = await jiraApiCall(
    {
      endpoint: `/rest/api/3/users/search?${params.toString()}`,
      accessToken,
    },
    JiraUsersSearchResultSchema,
    { baseUrl }
  );

  if (result.isErr()) {
    return result;
  }

  // Filter to only include Atlassian users as per documentation https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-user-search/#api-rest-api-3-user-search-get
  const filteredUsers = result.value.filter(
    (user) => user.accountType === "atlassian"
  );

  return new Ok(filteredUsers);
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
    // Get the base URL from accessible resources
    const baseUrl = await getJiraBaseUrl(accessToken);
    if (!baseUrl) {
      return makeMCPToolTextError("No base url found");
    }

    return await action(baseUrl, accessToken);
  } catch (error: unknown) {
    return logAndReturnError({
      error,
      message: "Operation failed",
    });
  }
};

function logAndReturnError({
  error,
  message,
}: {
  error: unknown;
  message: string;
}): CallToolResult {
  logger.error(
    {
      error,
    },
    `[JIRA MCP Server] ${message}`
  );
  return makeMCPToolTextError(normalizeError(error).message);
}
