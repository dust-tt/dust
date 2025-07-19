import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createComment,
  createIssue,
  getConnectionInfo,
  getIssue,
  getIssueFields,
  getIssueTypes,
  getProject,
  getProjects,
  getTransitions,
  searchIssues,
  transitionIssue,
  updateIssue,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  JiraCreateIssueRequestSchema,
  SEARCH_FILTER_FIELDS,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "jira",
  version: "1.0.0",
  description:
    "Comprehensive JIRA integration providing full issue management capabilities including create, read, update, comment, and workflow transition operations using the JIRA REST API.",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  icon: "JiraLogo",
  documentationUrl:
    "https://developer.atlassian.com/server/jira/platform/rest/v10007/intro/",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_issue",
    "Retrieves a single JIRA issue by its key (e.g., 'PROJ-123').",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    async ({ issueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const issue = await getIssue({
            baseUrl,
            accessToken,
            issueKey,
          });
          if (issue.isOk() && issue.value === null) {
            return makeMCPToolJSONSuccess({
              message: "No issue found with the specified key",
              result: { found: false, issueKey },
            });
          }
          if (issue.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving issue: ${issue.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue retrieved successfully",
            result: { issue: issue.value },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_projects",
    "Retrieves a list of JIRA projects.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getProjects(baseUrl, accessToken);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving projects: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Projects retrieved successfully",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_project",
    "Retrieves a single JIRA project by its key (e.g., 'PROJ').",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getProject(baseUrl, accessToken, projectKey);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving project: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolTextError(
              `No project found with the specified key: ${projectKey}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Project retrieved successfully",
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_transitions",
    "Gets available transitions for a JIRA issue based on its current status and workflow.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    async ({ issueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getTransitions(baseUrl, accessToken, issueKey);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving transitions: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Transitions retrieved successfully",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_comment",
    "Adds a comment to an existing JIRA issue.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      comment: z.string().describe("The comment text to add"),
      visibilityType: z
        .enum(["group", "role"])
        .optional()
        .describe("Visibility restriction type"),
      visibilityValue: z
        .string()
        .optional()
        .describe("Group or role name for visibility restriction"),
    },
    async (
      { issueKey, comment, visibilityType, visibilityValue },
      { authInfo }
    ) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const visibility =
            visibilityType && visibilityValue
              ? { type: visibilityType, value: visibilityValue }
              : undefined;

          const result = await createComment(
            baseUrl,
            accessToken,
            issueKey,
            comment,
            visibility
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error adding comment: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to add comment",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Comment added successfully",
            result: {
              issueKey,
              comment,
              commentId: result.value.id,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issues",
    "Search issues one or more filters.",
    {
      filters: z
        .array(
          z.object({
            field: z
              .string()
              .describe(
                `The field to filter by. Must be one of: ${SEARCH_FILTER_FIELDS.join(
                  ", "
                )}`
              ),
            value: z.string().describe("The value to search for"),
            fuzzy: z
              .boolean()
              .optional()
              .describe(
                "Use fuzzy search (~) instead of exact match (=). Currently only supported for summary field."
              ),
          })
        )
        .min(1)
        .describe("Array of search filters to apply (all must match)"),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for next page of results (for pagination)"),
    },
    async ({ filters, nextPageToken }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            filters,
            nextPageToken
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error searching issues: ${result.error}`
            );
          }
          const message =
            result.value.issues.length === 0
              ? "No issues found matching the search criteria"
              : "Issues retrieved successfully";
          return makeMCPToolJSONSuccess({
            message,
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issue_types",
    "Retrieves available issue types for a JIRA project.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          try {
            const result = await getIssueTypes(
              baseUrl,
              accessToken,
              projectKey
            );
            if (result.isErr()) {
              return makeMCPToolTextError(
                `Error retrieving issue types: ${result.error}`
              );
            }
            return makeMCPToolJSONSuccess({
              message: "Issue types retrieved successfully",
              result,
            });
          } catch (error) {
            return makeMCPToolTextError(
              `Error retrieving issue types: ${error}`
            );
          }
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issue_fields",
    "Retrieves available fields for creating issues in a JIRA project for a specific issue type.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      issueTypeId: z
        .string()
        .describe("The issue type ID to get fields for (required)"),
    },
    async ({ projectKey, issueTypeId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          try {
            const result = await getIssueFields(
              baseUrl,
              accessToken,
              projectKey,
              issueTypeId
            );
            if (result.isErr()) {
              return makeMCPToolTextError(
                `Error retrieving issue fields: ${result.error}`
              );
            }
            return makeMCPToolJSONSuccess({
              message: "Issue fields retrieved successfully",
              result,
            });
          } catch (error) {
            return makeMCPToolTextError(
              `Error retrieving issue fields: ${error}`
            );
          }
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_connection_info",
    "Gets comprehensive connection information including user details, cloud ID, and site URL for the currently authenticated JIRA instance.",
    {},
    async (_, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("No access token found");
      }

      const connectionInfo = await getConnectionInfo(accessToken);
      if (connectionInfo.isErr()) {
        return makeMCPToolTextError(
          `Failed to retrieve connection information: ${connectionInfo.error}`
        );
      }

      return makeMCPToolJSONSuccess({
        message: "Connection information retrieved successfully",
        result: connectionInfo,
      });
    }
  );

  server.tool(
    "transition_issue",
    "Transitions a JIRA issue to a different status/workflow state.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      transitionId: z.string().describe("The ID of the transition to perform"),
    },
    async ({ issueKey, transitionId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await transitionIssue(
            baseUrl,
            accessToken,
            issueKey,
            transitionId
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error transitioning issue: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to transition it",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Issue transitioned successfully",
            result: {
              issueKey,
              transitionId,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_issue",
    "Creates a new JIRA issue with the specified details.",
    {
      issueData: JiraCreateIssueRequestSchema.describe(
        "The description of the issue"
      ),
    },
    async ({ issueData }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await createIssue(baseUrl, accessToken, issueData);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error creating issue: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue created successfully",
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_issue",
    "Updates an existing JIRA issue with new field values.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      updateData: JiraCreateIssueRequestSchema.partial().describe(
        "The partial data to update the issue with"
      ),
    },
    async ({ issueKey, updateData }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await updateIssue(
            baseUrl,
            accessToken,
            issueKey,
            updateData
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error updating issue: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to update it",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Issue updated successfully",
            result: {
              ...result.value,
              updatedFields: Object.keys(updateData),
            },
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
