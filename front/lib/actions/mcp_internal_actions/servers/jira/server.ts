import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createComment,
  getConnectionInfo,
  getIssue,
  getIssueFields,
  getIssueTypes,
  getProject,
  getProjects,
  getTransitions,
  searchIssues,
  transitionIssue,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import type { SearchFilterField } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_utils";
import {
  escapeJQLValue,
  SEARCH_FILTER_FIELDS,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_utils";
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
          return makeMCPToolJSONSuccess({
            message: "Comment added successfully",
            result: {
              issueKey,
              comment,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "search_issues",
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
          })
        )
        .min(1)
        .describe("Array of search filters to apply (all must match)"),
    },
    async ({ filters }, { authInfo }) => {
      const fieldMapping = {
        issueType: "issueType",
        parentIssueKey: "parent",
        status: "status",
        assignee: "assignee",
        reporter: "reporter",
        project: "project",
        dueDate: "dueDate",
      } as const;

      // Check for unimplemented filters
      const unimplementedFilter = filters.find(
        (filter) =>
          !SEARCH_FILTER_FIELDS.includes(filter.field as SearchFilterField)
      );

      if (unimplementedFilter) {
        return makeMCPToolTextError(
          `searching with this filter is not implemented: ${unimplementedFilter.field}`
        );
      }

      const jqlConditions = filters.map((filter) => {
        const jqlField = fieldMapping[filter.field as SearchFilterField];
        return `${jqlField} = ${escapeJQLValue(filter.value)}`;
      });

      const jql = jqlConditions.join(" AND ");

      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(baseUrl, accessToken, jql);
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
            result: {
              ...result.value,
              searchCriteria: {
                filters,
                jql,
              },
            },
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
            if ("error" in result) {
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
    "Retrieves available fields for creating issues in a JIRA project, optionally filtered by issue type.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      issueTypeId: z
        .string()
        .optional()
        .describe(
          "Optional issue type ID to filter fields for a specific issue type"
        ),
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
            if ("error" in result) {
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

  return server;
};

export default createServer;
export { serverInfo };
